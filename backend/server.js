const { createServer } = require("http");
const {PORT,USERS_DB,USERS_DB_FILE,SESSIONS_DB,SESSIONS_DB_FILE,PUBLIC_DIR,MIME_TYPES,SESSION_LIFESPAN,} = require("./utils/state");
const { dbLogicPrimer, clearExpiredTokens } = require("./utils/db");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const router = require("./router/index");
const AppError = require("./middleware/AppError");

//load db
dbLogicPrimer(USERS_DB, USERS_DB_FILE);
dbLogicPrimer(SESSIONS_DB, SESSIONS_DB_FILE);

// session db cleanup
setInterval(
  () => {
    clearExpiredTokens(SESSIONS_DB, SESSIONS_DB_FILE, SESSION_LIFESPAN);
  },
  15 * 60 * 1000,
);

const server = createServer(async (req, res) => {
  const { url, method } = req;
  const filename = url === "/" ? "/signup.html" : url;
  const filepath = path.join(PUBLIC_DIR, filename);
  const ext = path.extname(filepath);
  const contentType = MIME_TYPES[ext] || "application/octet";
  const parsedURL = new URL(url, "http://localhost:3000");

  //auth and setting the url guard
  if (parsedURL.pathname.startsWith("/api/")) {
    //signup
    if (parsedURL.pathname === "/api/signup") {
      return router.handle(req, res);
    }
    //login
    if (parsedURL.pathname === "/api/login") {
      return router.handle(req, res);
    }
    //logout
    if (parsedURL.pathname === "/api/logout") {
      return router.handle(req, res);
    }
    //user profile routes
    if (parsedURL.pathname === "/api/user/profile") {
      if (method !== "GET" && method !== "PATCH" && method !== "DELETE") {
        throw new AppError(405, "Method not Allowed");
        return;
      }

      //get user profile
      if (method === "GET") {
        return router.handle(req, res);
      }

      //update user
      if (method === "PATCH") {
        return router.handle(req, res);
      }
      //delete user
      if (method === "DELETE") {
        return router.handle(req, res);
      }
    }
    //update password
    if (parsedURL.pathname === "/api/user/password") {
      return router.handle(req, res);
    }

    if (parsedURL.pathname === "/api/user/profile/picture") {
      const methodList = ["POST", "GET", "DELETE", "PATCH"];
      if (!methodList.includes(method)) {
        throw new AppError(405, "Method not Allowed");
      }

      if (method === "PATCH") {
        return router.handle(req, res);
      }

      if (method === "GET") {
        return router.handle(req, res);
      }

      if (method === "DELETE") {
        return router.handle(req, res);
      }
    } else {
      throw new Error(404, 'route not found')
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
