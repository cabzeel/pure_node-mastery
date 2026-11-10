const { getProfilePic, updateProfilePic, deleteProfilePic } = require("../../controllers/profilePicController")
const extractTokenAndUser = require("../../middleware/extractTokenAndUser")

function profilePicRoute(router) {
    router.get('/api/user/profile/picture', extractTokenAndUser, getProfilePic);
    router.patch('/api/user/profile/picture', extractTokenAndUser, updateProfilePic)
    router.delete('/api/user/profile/picture', extractTokenAndUser, deleteProfilePic);
}

module.exports = profilePicRoute