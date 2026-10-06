const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { dbLogicPrimer, passwordHash, unauthorizedHandler } = require("./utils/app");

//define global variables:
let USERS_DB = [];
let SESSIONS_DB = {};
const PORT = 3000;
const USERS_DB_FILE = path.join(__dirname, "db", "users.json");
const SESSIONS_DB_FILE = path.join(__dirname, "db", "sessions.json");
const SESSION_LIFESPAN = 15 * 60 * 1000;

//load from databases
dbLogicPrimer(USERS_DB, USERS_DB_FILE);
dbLogicPrimer(SESSIONS_DB, SESSIONS_DB_FILE);

//mime types
const MIME_TYPES = {
  ".js": "application/js",
  ".html": "text/html",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/JPEG",
};
//public directory..
const PUBLIC_DIR = path.join(__dirname, "public");

const server = http.createServer((req, res) => {
  //handle serving...
  const { url, method } = req;
  //parsed url:
  const parsedURL = new URL(url, "http://localhost:3000");
  const pathName = parsedURL.pathname;
  //get file name
  const filename = pathName === "/" ? "signup.html" : pathName;
  //get filepath
  const filepath = path.join(PUBLIC_DIR, filename);
  //get file extension
  const ext = path.extname(filepath);
  //content type
  const contentType = MIME_TYPES[ext] || "application/octet";
  //sign up
  if (url === "/api/signup" && method === "POST") {
    let body = "";
    //check for data streams:
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    //req.on end

    req.on("end", async () => {
      try {
        const parsedData = JSON.parse(body);
        const salt = crypto.randomBytes(16).toString("hex");
        const hashedPassword = await passwordHash(parsedData.password, salt);

        const incomingEmail = parsedData.email.toLowerCase().trim();
        const emailExists = USERS_DB.some(
          (user) => user.email.toLowerCase().trim() === incomingEmail,
        );

        if (emailExists) {
          res.writeHead(409, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              errors: {
                email: "user already exists",
              },
            }),
          );
          return;
        }
        const userID = crypto.randomUUID();
        const newUser = {
          id: userID,
          name: parsedData.name,
          email: parsedData.email,
          password: hashedPassword,
          salt: salt,
        };

        USERS_DB.push(newUser);
        fs.writeFile(
          USERS_DB_FILE,
          JSON.stringify(USERS_DB, null, 2),
          (err) => {
            console.log("data written successfully");
          },
        );

        const token = crypto.randomBytes(32).toString("hex");
        SESSIONS_DB[token] = {
          email: newUser.email,
          createdAt: Date.now(),
        };
        //write token to storage...
        fs.writeFile(
          SESSIONS_DB_FILE,
          JSON.stringify(SESSIONS_DB, null, 2),
          (err) => {
            if (err)
              console.error("Session database write error:", err.message);
          },
        );
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            token: token,
            user: {
              name: newUser.name,
              email: newUser.email,
            },
          }),
        );
      } catch (error) {
        console.error(error);
      }
    });
    return;
  }
  //sign in || login
  if (url === "/api/login" && method === "POST") {
    let body = "";
    console.log(url);

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      const parsedData = JSON.parse(body);
      const { email, password } = parsedData;

      const user = USERS_DB.find((user) => user.email === email);
      //password validation...
      if (user) {
        const isPasswordMatch =
          (await passwordHash(password, user.salt)) === user.password;
        if (!isPasswordMatch) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              msg: "Invalid password",
            }),
          );
          return;
        }

        const token = crypto.randomBytes(32).toString("hex");
        SESSIONS_DB[token] = {
          email: email,
          createdAt: Date.now(),
        };
        //write token to storage...
        fs.writeFile(
          SESSIONS_DB_FILE,
          JSON.stringify(SESSIONS_DB, null, 2),
          (err) => {
            if (err)
              console.error("Session database write error:", err.message);
          },
        );
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            token: token,
            user: {
              name: user.name,
              email: user.email,
            },
          }),
        );
        return;
      } else {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            msg: "user does not exist",
          }),
        );
        return;
      }
    });
    return;
  }

  //logout
  if (url.startsWith("/api/logout") && method === "POST") {
    const tokenParam = parsedURL.searchParams.get("token");
   
    if (SESSIONS_DB[tokenParam]) {
      console.log(
        `deleting active session for ${SESSIONS_DB[tokenParam].email}`,
      );
      delete SESSIONS_DB[tokenParam];
      fs.writeFile(
        SESSIONS_DB_FILE,
        JSON.stringify(SESSIONS_DB, null, 2),
        (err) => {
          if (err) console.error("Session database write error:", err.message);
        },
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          message: "scaffolding complete",
        }),
      );
      return;
    }
    const timeElapsed = Date.now() - SESSIONS_DB[tokenParam].createdAt;
    console.log(timeElapsed);


    if (timeElapsed > SESSION_LIFESPAN) {
      delete SESSIONS_DB[tokenParam];
      fs.writeFile(
        SESSIONS_DB_FILE,
        JSON.stringify(SESSIONS_DB, null, 2),
        (err) => {
          if (err) console.error("Session database write error:", err.message);
        },
      );
      unauthorizedHandler(res, PUBLIC_DIR);
      return;
    }
  }

  //get specific user
  if(url.startsWith('/api/user/profile') && method === 'GET') {
    const tokenParam = parsedURL.searchParams.get('token');

    if(!tokenParam || !SESSIONS_DB[tokenParam]) {
      unauthorizedHandler(res, PUBLIC_DIR);

      return;
    }
    const tokenEmail = SESSIONS_DB[tokenParam].email;
    const user = USERS_DB.find(user => user.email === tokenEmail);

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: true, msg: "Data endpoint reached" }));
    return;
  }

  if (pathName === "/dashboard.html") {
    const tokenParam = parsedURL.searchParams.get("token");

    if (!tokenParam || !SESSIONS_DB[tokenParam]) {
      
      unauthorizedHandler(res, PUBLIC_DIR);
      return;
    }
  }

  //when a file is requested
  fs.readFile(filepath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        fs.readFile(path.join(PUBLIC_DIR, "404.html"), (err404, file404) => {
          res.writeHead(404, { "content-type": "text/html" });
          res.end(file404, "utf8");
          return;
        });
      } else {
        res.writeHead(503, { "content-type": "text/html" });
        res.end("Internal server error");
      }
      return;
    }
    //if no error , serve the file
    res.writeHead(200, { "content-type": contentType });
    res.end(data, "utf8");
    return;
  });
});

server.listen(PORT, () =>
  console.log(`server running at http://localhost:${PORT}`),
);
