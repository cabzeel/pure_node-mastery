const { createServer } = require("http");
const {
  PORT,
  USERS_DB,
  USERS_DB_FILE,
  SESSIONS_DB,
  SESSIONS_DB_FILE,
  PUBLIC_DIR,
  MIME_TYPES,
  MAX_BYTE_SIZE,
  SESSION_LIFESPAN,
} = require("./utils/state");
const {
  dbLogicPrimer,
  methodGuard,
  byteSizeHandler,
  contentTypeGuard,
  passwordHash,
  writeToDB,
  error500,
  missingParamsHandler,
  invalidCredentials,
  timingsafeEqual,
  extractTokenAndUser,
  getRequestData,
  unauthorizedHandler,
  clearExpiredTokens,
} = require("./utils/app");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

//load db
dbLogicPrimer(USERS_DB, USERS_DB_FILE);
dbLogicPrimer(SESSIONS_DB, SESSIONS_DB_FILE);

// session db cleanup
setInterval(() => {
  clearExpiredTokens(SESSIONS_DB, SESSIONS_DB_FILE);
}, 14 * 60 * 1000);

const server = createServer(async (req, res) => {
  const { url, method } = req;
  //file handling
  const filename = url === "/" ? "/signup.html" : url;
  const filepath = path.join(PUBLIC_DIR, filename);
  const ext = path.extname(filepath);
  const contentType = MIME_TYPES[ext] || "application/octet";
  //url parsing...
  const parsedURL = new URL(url, "http://localhost:3000");

  //auth and setting the url guard
  if (parsedURL.pathname.startsWith("/api/")) {
    //content type guard

    //auth
    //signup
    if (parsedURL.pathname === "/api/signup") {
      if (method !== "POST") {
        methodGuard(res);
        return;
      }
      if (req.headers["content-type"] !== "application/json") {
        contentTypeGuard(res);
        return;
      }

      let body = "";
      let bodyLength = 0;
      req.on("data", (chunk) => {
        bodyLength += chunk.length;
        if (bodyLength > MAX_BYTE_SIZE) {
          byteSizeHandler(req, res);
          return;
        }
        body += chunk;
      });

      req.on("end", async () => {
        if (req.destroyed) {
          return;
        }
        try {
          const parsedData = JSON.parse(body);
          const { name, email, password } = parsedData;
          const id = crypto.randomUUID().toString("hex");
          //hash password
          const salt = crypto.randomBytes(16).toString("hex");
          const hashedPassword = await passwordHash(password, salt);
          //verify existing user
          const existingUser = USERS_DB.find(
            (user) => user.email === email.trim().toLowerCase(),
          );
          if (existingUser) {
            res.writeHead(409, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({
                success: false,
                message: "User already exists",
              }),
            );
          }
          // create new user object
          const user = {
            id,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            salt,
          };

          USERS_DB.push(user);
          writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
            if (err) {
              console.log("1: error happened here");
              error500(res, err);
              return;
            }
            const token = crypto.randomBytes(32).toString("hex");
            SESSIONS_DB[token] = {
              email: email.trim().toLowerCase(),
              createdAt: Date.now(),
            };
            writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
              if (err) {
                console.log("2: error happened here");
                error500(res, err);
                return;
              }

              res.writeHead(200, { "content-type": "application/json" });
              return res.end(
                JSON.stringify({
                  success: true,
                  user: { name: user.name, email: user.email, token },
                }),
              );
            });
            return;
          });
        } catch (error) {
          console.log("3: error happened here");
          error500(res, error);
          return;
        }
        return;
      });
      return;
    }

    //login
    if (parsedURL.pathname === "/api/login") {
      if (method !== "POST") {
        methodGuard(res);
        return;
      }

      if (req.headers["content-type"] !== "application/json") {
        contentTypeGuard(res);
        return;
      }
      try {
        let body = "";
        let bodyLength = 0;
        req.on("data", (chunk) => {
          bodyLength += chunk.length;
          if (bodyLength > MAX_BYTE_SIZE) {
            byteSizeHandler(req, res);
            return;
          }
          body += chunk;
        });

        req.on("end", async () => {
          if (req.destroyed) {
            return;
          }
          const { email, password } = JSON.parse(body);
          if (!email || !password) {
            missingParamsHandler(res);
            return;
          }
          //find user
          const user = USERS_DB.find(
            (user) => user.email === email.trim().toLowerCase(),
          );
          if (!user) {
            invalidCredentials(res);
            return;
          }
          const hashedPassword = await passwordHash(password, user.salt);
          const safeEqual = timingsafeEqual(hashedPassword, user.password);
          if (!safeEqual) {
            invalidCredentials(res);
            return;
          }
          //at this point user exists and credentials are valid so proceed to searching for an existing token
          for (const [token, { email }] of Object.entries(SESSIONS_DB)) {
            //delete all tokens where tokenEmail = user.email
            if (user.email === email) {
              delete SESSIONS_DB[token];
            }
          }
          // create new token
          const token = crypto.randomBytes(32).toString("hex");
          SESSIONS_DB[token] = { email: user.email, createdAt: Date.now() };
          writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
            if (err) {
              error500(res, err);
              return;
            }
            res.writeHead(200, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({
                success: true,
                user: { name: user.name, email: user.email, token },
              }),
            );
          });
        });
        return;
      } catch (error) {
        error500(res, error);
        return;
      }
    }

    //logout
    if (parsedURL.pathname === "/api/logout") {
      if (method !== "POST") {
        methodGuard(res);
        return;
      }
      const auth = extractTokenAndUser(req, res);
      if (!auth) {
        return;
      }
      const { tokenParam, user } = auth;
      //find all tokens for that user and delete
      for (const [token, { email, createdAt }] of Object.entries(SESSIONS_DB)) {
        if (email === user.email) {
          delete SESSIONS_DB[token];
        }
      }

      writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
        if (err) {
          error500(res, err);
          return;
        }

        res.writeHead(200, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({ success: true, message: "logout successful" }),
        );
      });
      return;
    }
    //user profile routes
    if (parsedURL.pathname === "/api/user/profile") {
      if (method !== "GET" && method !== "PATCH" && method !== "DELETE") {
        methodGuard(res);
        return;
      }
      //validate user and token
      const auth = extractTokenAndUser(req, res);
      if (!auth) {
        console.warn("error getting auth");
        return;
      }
      const { tokenParam, user } = auth;
      const session = SESSIONS_DB[tokenParam];
      //get user profile
      if (method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            success: true,
            user: { name: user.name, email: user.email },
          }),
        );
      }

      //update user
      if (method === "PATCH") {
        if (req.headers["content-type"] !== "application/json") {
          contentTypeGuard(res);
          return;
        }
        try {
          const incomingData = await getRequestData(req, res);
          if (!incomingData) {
            missingParamsHandler(res);
            return;
          }
          console.log(`old user info: `, user);

          const { name, email } = JSON.parse(incomingData);
          const existingUser = USERS_DB.find((user) => user.email === email);

          if (existingUser && existingUser.email !== session.email) {
            res.writeHead(409, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({
                success: false,
                message: "email already taken",
              }),
            );
          }

          const updates = { name: name, email: email.trim().toLowerCase() };
          Object.assign(user, updates);
          console.log(`new user: `, user);
          writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
            if (err) {
              error500(res, err);
              return;
            }
            //delete token
            delete SESSIONS_DB[tokenParam];

            const token = crypto.randomBytes(32).toString("hex");
            SESSIONS_DB[token] = { email: user.email, createdAt: Date.now() };
            writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
              if (err) {
                error500(res, err);
                return;
              }
              res.writeHead(200, { "content-type": "application/json" });
              return res.end(
                JSON.stringify({
                  success: true,
                  message: "user info updated successfully",
                }),
              );
            });
          });
        } catch (error) {
          res.writeHead(500, { "content-type": "application/json" });
          return res.end(
            JSON.stringify({ success: false, message: error.message }),
          );
        }
      }
      //delete user
      if (method === "DELETE") {
        const index = USERS_DB.findIndex(
          (user) => user.email === session.email,
        );

        if (index === -1) {
          res.writeHead(404, { "content-type": "application/json" });
          return res.end(
            JSON.stringify({ success: false, message: "User not found.." }),
          );
        }

        USERS_DB.splice(index, 1);
        writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
          if (err) {
            error500(res, err);
            return;
          }
          //delete token:made sure at every point in time, only one token exists per user...but I will still do a cleanup...
          for (const [token, { email }] of Object.entries(SESSIONS_DB)) {
            if (email === user.email) {
              delete SESSIONS_DB[token];
            }
          }

          writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
            if (err) {
              error500(res, err);
              return;
            }
            res.writeHead(200, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({
                success: true,
                messge: "user deleted successfully",
              }),
            );
          });
        });
      }
      return;
    }
    //update password
    if (parsedURL.pathname === "/api/user/password") {
      if (method !== "PATCH") {
        methodGuard(res);
        return;
      }

      if (req.headers["content-type"] !== "application/json") {
        contentTypeGuard(res);
        return;
      }

      //authenticate user...
      const auth = extractTokenAndUser(req, res);
      if (!auth) {
        invalidCredentials(res);
        return;
      }
      const { user } = auth;

      //
      try {
        const incomingData = await getRequestData(req, res);
        if(!incomingData) {
          console.log('something went wrong');
          return;
        }
        const {currentPassword, newPassword} = JSON.parse(incomingData);
        if(!currentPassword || !newPassword) {
          missingParamsHandler(res);
          return;
        }

        //hash current password and compare..
        const hashedPassword = await passwordHash(currentPassword, user.salt);
        const isSafeEqual = timingsafeEqual(hashedPassword, user.password);
        if(!isSafeEqual) {
          res.writeHead(400, {"content-type": 'application/json'});
          return res.end(JSON.stringify({success: false, message: 'invalid password'}));
        }

        //create new hash
        
        const salt = crypto.randomBytes(16).toString('hex');
        const updatedPassword = await passwordHash(newPassword, salt);
        const updated = {password: updatedPassword, salt: salt};
        Object.assign(user, updated);
        writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
          if(err) {
            error500(res, err);
            return;
          }
          res.writeHead(200, {"content-type": 'application/json'});
          return res.end(JSON.stringify({success: true, message: 'password update successful'}));
        })

        return;

      } catch (error) {
        error500(res, error);
      }
    } else {
      invalidCredentials(res);
      return;
    }

    return;
  }

  //file serving functionality
  fs.readFile(filepath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        fs.readFile(path.join(PUBLIC_DIR, "404.html"), (err404, file404) => {
          res.writeHead(404, {
            "content-type": "text/html",
          });

          res.end(file404, "utf8");
          return;
        });
      } else {
        res.writeHead(503, {
          "content-type": "text/html",
        });

        res.end("Internal server error");
      }

      return;
    }

    //if no error , serve the file
    res.writeHead(200, { "content-type": contentType });
    return res.end(data, "utf8");
  });
});

server.listen(PORT, () => {
  console.log(`server is live on http://localhost:3000`);
});
