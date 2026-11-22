const {createPost, getPosts, editPost, getSinglePost, deletePost, likePost, createComment, getComments, getSingleComment, deleteComment, editComment, likeComment, createReply, getReplies, editReply, getSingleReply, deleteReply, likeReply} = require("../../controllers/postsController")
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
    router.get('/api/posts/:postId/comments/:commentId', extractTokenAndUser, extractPostAndComments,getSingleComment);
    //like comment
    router.post('/api/posts/:postId/comments/:commentId/like', extractTokenAndUser, extractPostAndComments, likeComment)
    //reply
    router.post('/api/posts/:postId/comments/:commentId/replies', extractTokenAndUser, extractPostAndComments, createReply);
    router.get('/api/posts/:postId/comments/:commentId/replies', extractTokenAndUser, extractPostAndComments, getReplies);
    router.patch('/api/posts/:postId/comments/:commentId/replies/:replyId', extractTokenAndUser, extractPostAndComments, editReply);
    router.get('/api/posts/:postId/comments/:commentId/replies/:replyId', extractTokenAndUser, extractPostAndComments, getSingleReply);
    router.delete('/api/posts/:postId/comments/:commentId/replies/:replyId', extractTokenAndUser, extractPostAndComments, deleteReply);
    router.post('/api/posts/:postId/comments/:commentId/replies/:replyId/like', extractTokenAndUser, extractPostAndComments, likeReply);
}

module.exports = postRoutes