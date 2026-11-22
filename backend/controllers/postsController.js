const { unlinkSync, existsSync } = require("fs");
const AppError = require("../middleware/AppError");
const multipartStreamParser = require("../middleware/multipart_processor");
const optimizeImg = require("../middleware/optimizeImg");
const { writeToDB } = require("../utils/db");
const { cleanAndValidateFields, getRequestData } = require("../utils/parser");
const { status200 } = require("../utils/responses");
const { USERS_DB, POSTS_DB, POSTS_DB_FILE, PUBLIC_DIR, USERS_DB_FILE } = require("../utils/state");
const path = require('path')
const crypto = require('crypto');
const { verifyPostAuthor, processMultipartData, handleLike } = require("../utils/postHandlers");

async function createPost(req, res, next) {
    const {user} = req;
    if(!user) {
        throw new AppError(401, 'Must be loggedIn to create user');
    }
    const parser = new multipartStreamParser(req, res);
    const {filepath, fields} = await parser.startParsing();
  
    const result = await cleanAndValidateFields(fields);
    const { title, body, category, allowComments, tags} = result;
    const imagePath = await optimizeImg(filepath, 'postPic');
    const authorId = user.id;
    const id = crypto.randomUUID();
    const post = {
        title,
        body,
        category,
        allowComments,
        tags,
        id: id,
        author: {
            authorId: authorId,
            authorName: user.name,
            authorImage: user.imagePath
        },
        imagePath,
        likesCount: 0,
        commentCount: 0,
        comments: [],
        hasLiked: [],
        createdAt: Date.now(),
    }
    POSTS_DB.push(post);
    writeToDB(POSTS_DB_FILE, POSTS_DB, () => {
        return status200(res, () => JSON.stringify({success: true, message: 'Post created'}));
    })

}

async function getPosts(req, res, next) {
    const {user} = req;
    let posts = [];
    for (const post of POSTS_DB) {
        const publicPost = {
            title: post.title,
            body: post.body,
            category:post.category,
            imagePath: post.imagePath,
            tags: post.tags,
            id: post.id,
            author: {
                authorId: post.author.authorId,
                authorName: post.author.authorName,
                authorImage: post.author.authorImage
            },
            likesCount: post.hasLiked.length,
            commentCount: post.commentCount,
            createdAt: post.createdAt,
            likedByMe: post.hasLiked.includes(user.id) ? true : false
        }
        posts.push(publicPost);
    }
    return status200(res, () => {
       return JSON.stringify({
            success: true,
            data: posts,
        })
    })
}

async function getSinglePost(req, res, next) {
    const {user, params} = req;
    const post = POSTS_DB.find(post => post.id === params.id);
    if(!post) {
        throw new AppError(404, 'Post not found..')
    }
    return status200(res, () => {
        return JSON.stringify({
            success: true, 
            post: {
                title: post.title,
                category: post.category,
                body: post.body,
                tags: post.tags,
                allowComments: post.allowComments,
                imagePath: post.imagePath
            }}
        )}
    );
}

async function editPost(req, res, next) {
    const post = verifyPostAuthor(req)
    const {result, imagePath} = await processMultipartData(req, res);
    Object.assign(post, result);
    if(imagePath !== '') {
        const oldImgPath = path.join(PUBLIC_DIR, post.imagePath);
        if(existsSync(oldImgPath)) {
        unlinkSync(oldImgPath);
    }
    }
    //write changes to database...
    await writeToDB(POSTS_DB_FILE, POSTS_DB);

    return status200(res, () => JSON.stringify({success: true, post: {
        title: post.title,
        body: post.body,
        category: post.category,
        tags: post.tags,
        imagePath: post.imagePath,
        allowComments: post.allowComments
    }}))
}

async function deletePost(req, res, next) {
    const {user, params} = req;
    const post = verifyPostAuthor(req);

    const index = POSTS_DB.findIndex(post => post.id === params.id)
    if(index === -1) {
        throw new AppError(404, 'Resource does not exist...');
    }
    POSTS_DB.splice(index, 1);
    await writeToDB(USERS_DB_FILE, USERS_DB);
    return status200(res, () => {
        return JSON.stringify({success: true, message: 'Post deleted successfully'

        })
    })
}

async function likePost(req, res) {
    const {user, params} = req
    const post = POSTS_DB.find(post => post.id === params.id);
    if(!post) {
        throw new AppError(404, 'resource not found');
    }
    if(!post.hasLiked) {
        post.hasLiked = [];
    }
    await handleLike(post, user.id, res);
}

//Comments...create comment, edit comment, delete comment, fetch all comments
//create comment
async function createComment(req, res) {
    const {user, params} = req;
    const post = POSTS_DB.find(post => post.id === params.id);
    if(!post) {
        throw new AppError(404, 'Resource not found');
    }
    //get request data..
    const data = await getRequestData(req, res);
    const parsedData = JSON.parse(data);
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const comment = {
        id,
        text: parsedData.text.trim(),
        createdAt,
        author: {
            authorId: user.id,
            authorName: user.name,
            authorImg: user.imagePath
        },
        hasLiked:[],
        replies: [],
        likesCount: 0,
        replyCount: 0

    }
    post.comments.push(comment);
    await writeToDB(POSTS_DB_FILE, POSTS_DB);
    return status200(res, () => {
       return JSON.stringify({success: true, message: 'comment created successfully'})
    })
}

async function getComments(req, res) {
    const {params} = req;
    const post = POSTS_DB.find(post => post.id === params.id);
    if(!post) {
        throw new AppError(404, 'Resource not found')
    }
    let comments = [];
    for(const {id, text, createdAt, author, replies, replyCount} of post.comments) {
        const publicComment = {
            id, text, createdAt, author, replies, replyCount
        }
        comments.push(publicComment)
    }
    return status200(res, () => {
        return JSON.stringify({
            success: true,
            comments
        })
    })

}

async function getSingleComment(req, res) {
    const {comment} = req
    return status200(res, () => {
        return JSON.stringify({
            success: true,
            comment: comment
        })
    })
}

async function editComment(req, res) {
    const {comment} = req;
    const data = await getRequestData(req, res);
    const {text} = JSON.parse(data);

    comment.text = text.trim();
    await writeToDB(POSTS_DB_FILE, POSTS_DB);
    return status200(res, () => {
        return JSON.stringify({
            success: true, 
            comment: comment,
        })
    })
}

async function deleteComment(req, res) {
    const  {post, commentId, user, comment} = req;
    if(user.id !== post.author.authorId && user.id !== comment.author.authorId) {
        throw new AppError(403, 'Forbiden access to resource')
    }
    const commentIndex = post.comments.findIndex(comment => comment.id === commentId);
    if(commentIndex === -1) {
        throw new AppError(404, 'resource not found');
    }
    post.comments.splice(commentIndex, 1);
    await writeToDB(POSTS_DB_FILE, POSTS_DB);
    return status200(res, () => {
        return JSON.stringify({success: true, message: 'comment deleted successfully'});
    });
}

async function likeComment(req, res, next) {
    const {user, comment} = req
    await handleLike(comment, user.id, res)
}

async function createReply(req, res) {
    const {post, comment, user} = req;
    const data = await getRequestData(req, res);
    const {text} = JSON.parse(data);

    const id = crypto.randomUUID();
    const reply = {
        id: id,
        text: text.trim(),
        author: {
            authorId: user.id,
            authorName: user.name,
            authorImage: user.imagePath
        },
        createdAt: Date.now(),
        hasLiked: [],
        likesCount:0
    }
    comment.replies.push(reply);
    comment.replyCount = comment.replies.length
    await writeToDB(POSTS_DB_FILE, POSTS_DB);
    return status200(res, () => {
        return JSON.stringify({success: true, message: 'reply Created successfully'})
    })
}

async function getReplies(req, res) {
    const {comment} = req;
    return status200(res, () => {
        return JSON.stringify({success: true, data: comment.replies})
    })
}
async function editReply(req, res) {
    const {comment, params} = req;
    const {replyId} = params;
    const reply = comment.replies.find(rep => rep.id === replyId);
    if(!reply) {
        throw new AppError(404, 'Resource not found...in reply')
    }
    const data = await getRequestData(req, res);
    const {text} = JSON.parse(data);
    reply.text = text.trim();
    await writeToDB(POSTS_DB_FILE, POSTS_DB);
    return status200(res, () => {
        return JSON.stringify({success: true, message: 'reply edited successfully'});
    })

}

async function getSingleReply(req, res) {
    const {comment, replyId} = req;
    const reply = comment.replies.find(rep => rep.id === replyId);
    if(!reply) {
        throw new AppError(404, 'Resource not found');
    }
    return status200(res, ()=> {
        return JSON.stringify({success: true,  reply})
    })
}

async function deleteReply(req, res) {
    const {comment, params} = req;
    const {replyId} = params;

    const index = comment.replies.findIndex(i => i.id === replyId);

    if(index === -1) {
        throw new AppError(404, 'Reply not found');
    }
    comment.replies.splice(index, 1);
    await writeToDB(POSTS_DB_FILE, POSTS_DB);
    return status200(res, ()=> {
        return JSON.stringify({success: true, message: 'Reply deleted successfully'})
    })
}
async function likeReply(req, res) {
    
    const {user, params, comment} = req;
    const {replyId} = params;
    const reply = comment.replies.find(rep => rep.id === replyId);

    if(!reply) {
        throw new AppError(404, 'Resource not found...like');
    }
    await handleLike(reply, user.id, res);
}

module.exports = {createPost, getPosts, editPost, getSinglePost, deletePost, likePost, createComment, getComments, getSingleComment, deleteComment, editComment, likeComment, createReply, getReplies, editReply, getSingleReply, deleteReply, likeReply}