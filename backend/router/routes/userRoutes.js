const { getUser, updateUserInfo, deleteUser, updatePassword, getUserFromQuery } = require("../../controllers/usersController")
const extractTokenAndUser = require("../../middleware/extractTokenAndUser");


module.exports = {
    userRoutes: function(router) {
        router.get('/api/users/:id', extractTokenAndUser, getUser);
        router.patch('/api/users/:id', extractTokenAndUser, updateUserInfo);
        router.delete('/api/users/:id', extractTokenAndUser, deleteUser);
        router.patch('/api/users/:id/password', extractTokenAndUser, updatePassword);
        router.get('/api/users', extractTokenAndUser, getUserFromQuery);
    }
}