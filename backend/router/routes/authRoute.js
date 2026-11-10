const { signUp, logIn, logOut } = require("../../controllers/authController");
const extractTokenAndUser = require("../../middleware/extractTokenAndUser");

function authRoutes(router) {
    router.post('/api/signup', signUp);
    router.post('/api/login', logIn);
    router.post('/api/logout', extractTokenAndUser, logOut);
}

module.exports = authRoutes