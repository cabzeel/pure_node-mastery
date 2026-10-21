const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  dbLogicPrimer,
  clearDatabase,
  passwordHash,
  writeToDB,
  unauthorizedHandler,
  clearExpiredTokens,
  AuthenticateToken,
  missingParamsHandler,
  byteSizeHandler,
  contentTypeGuard,
  extractTokenAndUser,
} = require("./utils/app");
const {
  USERS_DB,
  SESSIONS_DB,
  USERS_DB_FILE,
  SESSIONS_DB_FILE,
  SESSION_LIFESPAN,
  PUBLIC_DIR,
  PORT,
  MIME_TYPES,
  MAX_BYTE_SIZE,
} = require("./utils/state");

// load databases:
dbLogicPrimer(USERS_DB, USERS_DB_FILE);
dbLogicPrimer(SESSIONS_DB, SESSIONS_DB_FILE);

//delete expired tokens

setInterval(() => {
  clearExpiredTokens(SESSIONS_DB, SESSIONS_DB_FILE, SESSION_LIFESPAN);
}, SESSION_LIFESPAN);


const server = http.createServer((req, res) => {
  console.log(req.headers['authorization'])
  const { url, method } = req;
  const parsedURL = new URL(url, "http://localhost:3000");
  const fileName = url === "/" ? "signup.html" : url;
  //filepath
  const filePath = path.join(PUBLIC_DIR, fileName);
  //setting mime type:
  const ext = path.extname(fileName);
  const contentType = MIME_TYPES[ext] || "application/octet";

  if (url.startsWith("/api")) {
    //sign up functionality:

    if (url === "/api/signup") {
      //method guard
      if (method !== "POST") {
        res.writeHead(405, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({ success: false, message: "Method Not Allowed" }),
        );
      }
      //content type guard
      if (req.headers["content-type"] !== "application/json") {
        contentTypeGuard(res);
        return;
      }

      let body = "";
      let bodyLength = 0;
      let payloadTooLarge = false;

      req.on("data", (chunk) => {
        if (payloadTooLarge) {
          return;
        }

        bodyLength += chunk.length;
        if (bodyLength > MAX_BYTE_SIZE) {
          payloadTooLarge = true;
          byteSizeHandler(req, res);
          return;
        }

        body += chunk;
      });

      req.on("end", async () => {
        if (payloadTooLarge) {
          return;
        }
        try {
          const parsedData = JSON.parse(body);
          const name = parsedData.name ? parsedData.name.trim() : "";
          const email = parsedData.email ? parsedData.email.trim() : "";

          if (!name || !email || !parsedData.password) {
            missingParamsHandler(res);
            return;
          }
          //check if user already exists...
          const incomingEmail = parsedData.email.trim().toLowerCase();
          const isExisting = USERS_DB.find(
            (user) => user.email === incomingEmail,
          );

          if (isExisting) {
            res.writeHead(409, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                success: false,
                message: "error: user already exists",
              }),
            );
            return;
          }
          //hash password and create new user
          const salt = crypto.randomBytes(16).toString("hex");
          const hashedPassword = await passwordHash(parsedData.password, salt);
          const id = crypto.randomUUID();
          //create new user object...
          const newUser = {
            id: id,
            name: parsedData.name,
            password: hashedPassword,
            email: incomingEmail,
            salt: salt,
          };
          //save user to db
          USERS_DB.push(newUser);
          //write user to db file
          writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
            if (err) {
              res.writeHead(500, { "content-type": "application/json" });
              return res.end(
                JSON.stringify({ success: false, message: err.message }),
              );
            }
            //create token:
            const token = crypto.randomBytes(32).toString("hex");
            SESSIONS_DB[token] = {
              email: newUser.email,
              createdAt: Date.now(),
            };
            //write token to db file
            writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
              if (err) {
                res.writeHead(500, { "content-type": "application/json" });
                return res.end(
                  JSON.stringify({ success: false, message: err.message }),
                );
              }

              res.writeHead(200, { "content-type": "application/json" });
              return res.end(
                JSON.stringify({
                  success: true,
                  user: {
                    name: newUser.name,
                    email: newUser.email,
                    token: token,
                  },
                }),
              );
            });
          });
          return;
        } catch (error) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(
            JSON.stringify({
              success: false,
              message: error.message || "invalid JSON syntax",
            }),
          );
        }
      });
      return;
    }

    //login functionality..
    if (url === "/api/login") {
      if (method !== "POST") {
        res.writeHead(405, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({ success: false, message: "Method Not Allowed" }),
        );
      }
      //content type guard
      if (req.headers["content-type"] !== "application/json") {
        contentTypeGuard(res);
        return;
      }

      //receive incoming data:
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
          const { email, password } = parsedData;

          if (!email || !password) {
            missingParamsHandler(res);
            return;
          }

          const incomingEmail = email;
          //verify if email exists in db:
          const user = USERS_DB.find(
            (user) => user.email === incomingEmail.trim().toLowerCase(),
          );
          if (!user) {
            res.writeHead(401, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({
                success: false,
                message: "user does not exist",
              }),
            );
          }
          //verify password match
          const hashedPassword = await passwordHash(password, user.salt);
          if (hashedPassword != user.password) {
            res.writeHead(401, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({
                success: false,
                message: "invalid password, please try again",
              }),
            );
          }
          //at this point, user exists and password is a match...create login token...but verify if an active token exists for that user...
          let activeToken = null;
          for (const [token, { email, createdAt }] of Object.entries(
            SESSIONS_DB,
          )) {
            const isValid = Date.now() - createdAt < SESSION_LIFESPAN;
            if (email === user.email && isValid) {
              activeToken = token;
              break;
            }
          }
          if (activeToken) {
            res.writeHead(200, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({
                success: true,
                token: activeToken,
                user: { name: user.name, email: user.email },
              }),
            );
          }
          //if missing active token

          const token = crypto.randomBytes(32).toString("hex");
          SESSIONS_DB[token] = {
            email: user.email,
            createdAt: Date.now(),
          };
          //write token to DB and send to user
          writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
            if (err) {
              res.writeHead(500, { "content-type": "application/json" });
              return res.end(
                JSON.stringify({ success: false, message: err.message }),
              );
            }

            res.writeHead(200, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({
                success: true,
                token,
                user: { name: user.name, email: user.email },
              }),
            );
          });
          return;
        } catch (error) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(
            JSON.stringify({
              success: false,
              message: error.message || "invalid JSON",
            }),
          );
        }
      });
      return;
    }

    //logout functionality
    if (url.startsWith("/api/logout")) {
      if (method !== "POST") {
        res.writeHead(405, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({ success: false, message: "Method Not Allowed" }),
        );
      }

      const tokenParam = parsedURL.searchParams.get("token");
      //if invalid token
      if (!AuthenticateToken(res, tokenParam)) {
        return;
      };
      //delete token from database..
      delete SESSIONS_DB[tokenParam];
      writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
        if (err) {
          res.writeHead(500, { "content-type": "application/json" });
          return res.end(
            JSON.stringify({ success: false, message: err.message }),
          );
        }
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            success: true,
            message: "data received successfully",
          }),
        );
      });
      return;
    }

    //CRUD operations
    if (parsedURL.pathname === "/api/user/profile") {
      if (method !== "GET" && method !== "PATCH" && method !== "DELETE") {
        res.writeHead(405, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({ success: false, message: "Method Not Allowed" }),
        );
      }
      //extract token
        
      const {tokenParam, user} = extractTokenAndUser(req);
      if (!AuthenticateToken(res, tokenParam)) {
          return;
      }
      if (method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            success: true,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
            },
          }),
        );
      }
      //update user profile
      if (method === "PATCH") {
      //content type guard
      if(req.headers['content-type'] !== 'application/json') {
        contentTypeGuard(res);
        return;
      }
        //receive data
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });

        req.on("end", async () => {
          try {
            const { name, email } = JSON.parse(body);
            if (!name || !email) {
              missingParamsHandler(res);
              return;
            }

            //verify if incoming email belongs to an existing user
            const existingUser = USERS_DB.find(user => user.email === email.trim().toLowerCase());
            //verify if this existing user === user(logged in user)..if not, then the email is taken
            if(existingUser && existingUser.email !== user.email) {
              res.writeHead(409, {'content-type': 'application/json'});
              return res.end(JSON.stringify({success: false, message: 'email already taken'}));
            }

            if (name) user.name = name;
            if (email) user.email = email.trim().toLowerCase();

            writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
              if (err) {
                res.writeHead(500, { "content-type": "application/json" });
                return res.end(
                  JSON.stringify({ success: false, message: err.message }),
                );
              }
              delete SESSIONS_DB[tokenParam];
              //create token:
              const token = crypto.randomBytes(32).toString("hex");
              SESSIONS_DB[token] = {
                email: user.email,
                createdAt: Date.now(),
              };
              //write token to db file
              writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
                if (err) {
                  res.writeHead(500, { "content-type": "application/json" });
                  return res.end(
                    JSON.stringify({ success: false, message: err.message }),
                  );
                }

                res.writeHead(200, { "content-type": "application/json" });
                return res.end(
                  JSON.stringify({
                    success: true,
                    user: {
                      name: user.name,
                      email: user.email,
                      token: token,
                    },
                  }),
                );
              });
            });
          } catch (error) {
            res.writeHead(500, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({
                success: false,
                message: "an internal error occured",
              }),
            );
          }
        });

        return;
      }

      //delete user
      if (method === "DELETE") {
        
        //delete operation:
        const index = USERS_DB.findIndex((user) => user.email === SESSIONS_DB[tokenParam].email);
        if (index !== -1) {
          USERS_DB.splice(index, 1);
        }
        writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
          if (err) {
            res.writeHead(500, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({ success: false, message: err.message }),
            );
          }

          // delete all tokens partaining to user
          for(const [token, {email, createdAt}] of Object.entries(SESSIONS_DB)) {
            if(email === user.email) {
              delete SESSIONS_DB[token];
            }
          }
          
          writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
            if (err) {
              res.writeHead(500, { "content-type": "application/json" });
              return res.end(JSON.stringify({ success: false, message: err.message }));
            }
            res.writeHead(200, { "content-type": "application/json" });
            return res.end(JSON.stringify({success: true, message: "user deleted successfully"}))
          });
        })}
    }

    //change password
    if (parsedURL.pathname === "/api/user/password") {
      if (method !== "PATCH") {
        res.writeHead(405, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({ success: false, message: "Method Not Allowed" }),
        );
      }

      //content type guard
      if (req.headers["content-type"] !== "application/json") {
        contentTypeGuard(res);
        return;
      }

      //intercept data
      let body = "";
      req.on("data", (chunk) => (body += chunk));

      req.on("end", async () => {
        const {user, tokenParam} = extractTokenAndUser(req)

        try {
          const { currentPassword, newPassword } = JSON.parse(body);
          if (!currentPassword || !newPassword) {
            missingParamsHandler(res);
            return;
          }
          //locate loggedin user
          
          //everything here feels redundant because I think if someone comes upto this point or is at the point of changing a password, then it is already confirmed they are a user
          if (!user) {
            unauthorizedHandler(res, PUBLIC_DIR);
            return;
          }
          const hashedPassword = await passwordHash(currentPassword, user.salt);
          if (hashedPassword != user.password) {
            res.writeHead(401, { "content-type": "application/json" });
            return res.end(
              JSON.stringify({
                success: false,
                message: "password does not exist",
              }),
            );
          }
          const newSalt = crypto.randomBytes(16).toString("hex");
          const newHashedPassword = await passwordHash(newPassword, newSalt);
          user.password = newHashedPassword;
          user.salt = newSalt;
          //write to db...
          writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
            if (err) {
              res.writeHead(500, { "content-type": "application/json" });
              return res.end(
                JSON.stringify({ success: false, message: err.message }),
              );
            }
            delete SESSIONS_DB[tokenParam];
            //create token:
            const token = crypto.randomBytes(32).toString("hex");
            SESSIONS_DB[token] = {
              email: user.email,
              createdAt: Date.now(),
            };
            //write token to db file
            writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
              if (err) {
                res.writeHead(500, { "content-type": "application/json" });
                return res.end(
                  JSON.stringify({ success: false, message: err.message }),
                );
              }

              res.writeHead(200, { "content-type": "application/json" });
              return res.end(
                JSON.stringify({
                  success: true,
                  user: {
                    name: user.name,
                    email: user.email,
                    token: token,
                  },
                }),
              );
            });
          });
          return;
        } catch (error) {
          res.writeHead(500, { "content-type": "application/json" });
          return res.end(
            JSON.stringify({ success: false, message: error.message }),
          );
        }
      });
      return;
    } 
    
//post routes
    if(parsedURL.pathname === "/api/posts") {
      const {tokenParam, user} = extractTokenAndUser(req);
      if(!AuthenticateToken(res, tokenParam)) {
        return;
      }

    }
    
    
    else {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          success: false,
          message: "error reaching route, does not exist",
        }),
      );
    }
  }


  //server file serving functionality
  fs.readFile(filePath, (err, file) => {
    if (err) {
      if (err.code === "ENOENT") {
        fs.readFile(path.join(PUBLIC_DIR, "404.html"), (err404, file404) => {
          if (err404) {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                success: false,
                msg: "resource does not exist on server",
              }),
            );
            return;
          }
          res.writeHead(404, { "content-type": contentType });
          res.end(file404, "utf8");
          return;
        });
        return;
      } else {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            message: "Sorry, an internal server error ocurred",
          }),
        );
        return;
      }
    }

    res.writeHead(200, { "content-type": contentType });
    res.end(file, "utf8");
  });
});

server.listen(PORT, () =>
  console.log(`server running at http://localhost:${PORT}`),
);
