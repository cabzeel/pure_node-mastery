const { POSTS_DB } = require("./state");
const AppError = require("../middleware/AppError");
const multipartStreamParser = require("../middleware/multipart_processor");
const { cleanAndValidateFields } = require("./parser");
const optimizeImg = require("../middleware/optimizeImg");

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
    console.log(filepath, fields)
    console.log(typeof filepath)
    const result = await cleanAndValidateFields(fields);
    const imagePath = await optimizeImg(filepath, 'postPic');
    console.log(imagePath)

    return {result, imagePath};
}

module.exports = { verifyPostAuthor, processMultipartData }