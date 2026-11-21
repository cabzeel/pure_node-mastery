const {createPost, getPosts, editPost, getSinglePost, deletePost, likePost, createComment, getComments, getSingleComment, deleteComment, editComment} = require("../../controllers/postsController")
const extractTokenAndUser = require("../../middleware/extractTokenAndUser");
const { extractPostAndComments } = require("../../utils/postHandlers");

function postRoutes(router) {
    router.post('/api/posts', extractTokenAndUser, createPost);
    router.get('/api/posts', extractTokenAndUser, getPosts);
    router.get('/api/posts/:id', extractTokenAndUser, getSinglePost);
    router.patch('/api/posts/:id', extractTokenAndUser, editPost);
    router.delete('/api/posts/:id', extractTokenAndUser, deletePost);
    router.post('/api/posts/:id/like', extractTokenAndUser, likePost);
    //comments
    router.post('/api/posts/:id/comments', extractTokenAndUser, createComment)
    router.get('/api/posts/:id/comments', extractTokenAndUser, getComments)
    router.patch('/api/posts/:postId/comments/:commentId', extractTokenAndUser, extractPostAndComments, editComment)
    router.delete('/api/posts/:postId/comments/:commentId', extractTokenAndUser, extractPostAndComments, deleteComment)
    router.get('/api/posts/:postId/comments/:commentId', extractTokenAndUser, extractPostAndComments,getSingleComment)

}

module.exports = postRoutes