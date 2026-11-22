const { POSTS_DB, POSTS_DB_FILE } = require("./state");
const AppError = require("../middleware/AppError");
const multipartStreamParser = require("../middleware/multipart_processor");
const { cleanAndValidateFields } = require("./parser");
const optimizeImg = require("../middleware/optimizeImg");
const { writeToDB } = require("./db");
const { status200 } = require("./responses");

function verifyPostAuthor(req) {
    const {params, user} = req;
    //verify post existence
    const post = POSTS_DB.find(post => post.id === params.id);
    if(!post) {
        throw new AppError(404, 'Resource not found');
    }
    //verify link between loggedIn user and post
    const isAuthor = post.author.authorId === user.id;
    if(!isAuthor) {
        throw new AppError(403, 'Forbiden, this user cannot perform this operation');
    }
    return post
}

async function processMultipartData(req, res) {
    const parser = new multipartStreamParser(req, res);
    const {filepath, fields} = await parser.startParsing();
    const result = await cleanAndValidateFields(fields);
    let imagePath;
    if(!filepath) {
        imagePath = '';
        return {result, imagePath}
    } 
    imagePath = await optimizeImg(filepath, 'postPic');

    return {result, imagePath};
}

async function extractPostAndComments(req, res, next) {
    const {params} = req;
    const {postId, commentId} = params;
    const post = POSTS_DB.find(post => post.id === postId) 
    if(!post) {
        throw new AppError(404, 'Resource not found');
    }

    const comment = post.comments.find(com => com.id === commentId);
    if(!comment) {
        throw new AppError(404, 'Resource not found')
    }
    req.post = post;
    req.postId = postId;
    req.commentId = commentId;
    req.comment = comment;
    next();
}

async function handleLike(target, targetId, res) {
    if(target.hasLiked.includes(targetId)) {
        const index = target.hasLiked.findIndex(i => i === targetId);
        target.hasLiked.splice(index, 1);
        target.likesCount = target.length;
        await writeToDB(POSTS_DB_FILE, POSTS_DB);
        return status200(res, () => {
            return JSON.stringify({success: true, likesCount: target.likesCount})
        })
    }
    target.hasLiked.push(targetId);
    target.likesCount = target.hasLiked.length;
    await writeToDB(POSTS_DB_FILE, POSTS_DB);
    return status200(res, () => {
        return JSON.stringify({success: true, likesCount: target.likesCount})
    })
}

module.exports = { verifyPostAuthor, processMultipartData, extractPostAndComments, handleLike }