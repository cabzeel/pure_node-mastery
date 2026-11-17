const { createServer } = require("http");
const {PORT, SESSIONS_DB,SESSIONS_DB_FILE, SESSION_LIFESPAN,} = require("./utils/state");
const { clearExpiredTokens, loadDatabases } = require("./utils/db");
const router = require("./router/index");
const { fileServingFunctionality } = require("./utils/parser");

//load db
loadDatabases()
// session db cleanup
setInterval(() => { clearExpiredTokens(SESSIONS_DB, SESSIONS_DB_FILE, SESSION_LIFESPAN);}, 15 * 60 * 1000);

const server = createServer(async (req, res) => {
  const { url } = req;
  const parsedURL = new URL(url, "http://localhost:3000");
  
  if (parsedURL.pathname.startsWith("/api/")) {
   return router.handle(req, res)
  }

  //file serving functionality
  await fileServingFunctionality(req, res);
});

server.listen(PORT, () => {
  console.log(`server is live on http://localhost:3000`);
});
