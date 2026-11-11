const { getUser, updateUserInfo, deleteUser, updatePassword } = require("../../controllers/usersController")
const extractTokenAndUser = require("../../middleware/extractTokenAndUser");
const testRouter = require("../../test/test");


module.exports = {
    userRoutes: function(router) {
        router.get('/api/user/profile', testRouter, extractTokenAndUser, getUser);
        router.patch('/api/user/profile', extractTokenAndUser, updateUserInfo);
        router.delete('/api/user/profile', extractTokenAndUser, deleteUser);
        router.patch('/api/user/password', extractTokenAndUser, updatePassword)
    }
}