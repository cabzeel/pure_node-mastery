const fs = require('fs');
const { error404, error500, status200, invalidCredentials } = require('../utils/responses');
const { serveImg, processImg } = require('../utils/parser');
const path = require('path');
const { writeToDB } = require('../utils/db');
const { USERS_DB_FILE, USERS_DB } = require('../utils/state');

//create profile pic
function getProfilePic(req, res) {
    try {
        const {user} = req;
        if(!user) {
            return invalidCredentials(res);
        }
        const imgPath = user.picMetaData.filepath;
        return serveImg(res, imgPath);
    } catch (error) {
        res.writeHead(400, {'content-type': 'application/json'})
        res.end(error.message)
    }
}

async function updateProfilePic(req, res, user) {
    try {
        const data = await processImg(req, res);
        user.picMetaData = data;

        writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
            if(err) {
                return error500(res, err);
            }
            return status200(res, () => {
                return JSON.stringify({success: true, message: 'profile pic updated successfully'});
            })
        })
    } catch (error) {
        return error500(res, error);
    }
    
}

function deleteProfilePic(res, user) {
    try{
        const imgPath = user.picMetaData.filepath;
        //remove current pic
        fs.unlinkSync(imgPath);
        //set new filePath to the default
        user.picMetaData.filepath = path.resolve(__dirname, '../uploads/default.webp');
        //write changes to DB..
        writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
            if(err) {
                return error500(res, err);
            }
            return status200(res, () => {
                return JSON.stringify({success: true, message: 'profile pic removed successfully'});
            });
        })
    } catch(error) {
        return error500(res, error);
    }
}

module.exports =  { getProfilePic, updateProfilePic, deleteProfilePic }