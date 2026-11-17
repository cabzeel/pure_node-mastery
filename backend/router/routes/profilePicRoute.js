const { getProfilePic, updateProfilePic, deleteProfilePic } = require("../../controllers/profilePicController")
const extractTokenAndUser = require("../../middleware/extractTokenAndUser")

function profilePicRoute(router) {
    router.patch('/api/users/:id/picture', extractTokenAndUser, updateProfilePic)
    router.delete('/api/users/:id/picture', extractTokenAndUser, deleteProfilePic);
}

module.exports = profilePicRoute;