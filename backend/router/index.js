const Router = require("./Router");
const authRoutes = require("./routes/authRoute");
const profilePicRoute = require("./routes/profilePicRoute");
const {userRoutes} = require("./routes/userRoutes");

const router = new Router();
authRoutes(router);
userRoutes(router);
profilePicRoute(router)
module.exports = router;