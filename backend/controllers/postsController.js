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
const { verifyPostAuthor, processMultipartData } = require("../utils/postHandlers");

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
        createdAt: Date.now()
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
    console.log(params.id);
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
    const {user} =  req;
        //confirm if the person editing the post is the creator
    const post = verifyPostAuthor(req)
    
    const {result, imagePath} = await processMultipartData(req, res);
    Object.assign(post, result);
    //delete the old image...
    const oldImgPath = path.join(PUBLIC_DIR, post.imagePath)
    if(existsSync(oldImgPath)) {
        unlinkSync(path.join(oldImgPath));
    }
    post.imagePath = imagePath;
    //write changes to database...
    await writeToDB(POSTS_DB_FILE, POSTS_DB);

    return status200(res, () => JSON.stringify({success: true, post: {
        title: post.title,
        body: post.body,
        category: post.category,
        tags: post.tags,
        imagePath: imagePath,
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
    if(post.hasLiked.includes(user.id)) {
        const index = post.hasLiked.findIndex(i => i === user.id);
        post.hasLiked.splice(index, 1);
        post.likesCount = post.hasLiked.length;
        await writeToDB(POSTS_DB_FILE, POSTS_DB)
        return status200(res, () => {
            return JSON.stringify({
                success: true, 
                likesCount:post.likesCount
            })
        })
    }
    post.hasLiked.push(user.id);
    post.likesCount = post.hasLiked.length;
    await writeToDB(POSTS_DB_FILE, POSTS_DB)
    return status200(res, () => {
        return JSON.stringify({success: true, likesCount: post.likesCount});
    })
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
        }
    }
    post.comments.push(comment);
    await writeToDB(POSTS_DB_FILE, POSTS_DB);
    return status200(res, () => {
       return JSON.stringify({success: true, message: 'comment created successfully'})
    })
}

async function getComments(req, res) {
    const {params, user} = req;
    const post = POSTS_DB.find(post => post.id === params.id);
    if(!post) {
        throw new AppError(404, 'Resource not found')
    }
    return status200(res, () => {
        return JSON.stringify({
            success: true,
            comments: post.comments
        })
    })

}

async function getSingleComment(req, res) {
    const {params} = req;
    console.log(params)
}

async function deleteComment(req, res) {
    const  { params } = req;
    const {postId, commentId} = params;
    const post = POSTS_DB.find(post => post.id === postId);
    if(!post) {
        throw new AppError(404, 'Resource not found');
    }
    const commentIndex = post.comments.findIndex(comment => comment.id === commentId);
    if(commentIndex === -1) {
        throw new AppError(404, 'resource not found');
    }
    post.comments.splice(commentIndex, 1);
    await writeToDB(POSTS_DB_FILE, POSTS_DB);
    return status200(res, () => {
        return JSON.stringify({success: true, message: 'comment deleted successfully'});
    })

}
module.exports = {createPost, getPosts, editPost, getSinglePost, deletePost, likePost, createComment, getComments, getSingleComment, deleteComment}