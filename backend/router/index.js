const Router = require("./Router");
const authRoutes = require("./routes/authRoute");
const postRoutes = require("./routes/postsRoute");
const profilePicRoute = require("./routes/profilePicRoute");
const {userRoutes} = require("./routes/userRoutes");
const workoutRoutes = require("./routes/workoutRoutes");

const router = new Router();
authRoutes(router);
userRoutes(router);
profilePicRoute(router);
postRoutes(router);
workoutRoutes(router);
module.exports = router;