const { extractTokenAndUser, passwordHash, timingsafeEqual } = require("../utils/auth");
const { writeToDB, deleteTokens, createToken } = require("../utils/db");
const { getRequestData } = require("../utils/parser");
const { contentTypeGuard, missingParamsHandler, errorConflict, error500, status200, error404, invalidCredentials, methodGuard } = require("../utils/responses");
const crypto = require('crypto')
const { USERS_DB, USERS_DB_FILE, SESSIONS_DB, SESSIONS_DB_FILE } = require("../utils/state");


function getUser(req, res, next) {
    const {user} = req;
    console.log(user)
    return status200(res, () => {
        return JSON.stringify({
        success: true,
        user: {name: user.name, email: user.email}
    })})
}

async function updateUserInfo(req, res, next) {
    try {
        const { headers, user } = req;
        if(headers['content-type'] !== 'application/json') {
            return contentTypeGuard(res);
        }

        const data = await getRequestData(req, res);
        if(!data) {
            return missingParamsHandler(res);
        }
        const {name, email} = JSON.parse(data);
        const existingUser = USERS_DB.find(user => user.email === email.trim().toLowerCase());

        if(existingUser && existingUser.email !== session.email) {
            errorConflict(res, () => {
                return {success: false, message: 'email already taken'}
            })
        }

        const updates = {name: name, email: email.trim().toLowerCase()};
        Object.assign(user, updates);
        writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
            if(err) {
                return error500(res, err);
            }
            deleteTokens(email);
        })
        const  { token } = createToken(user.email)

        writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
            if(err) {
                return error500(res, err);
            }
            return status200(res, () => {
                return JSON.stringify({success: true, message: 'user updated successfully', user:{name: user.name, email: user.email, token}})
            })
        })

    } catch (error) {
        return error500(res, error);
    }
}

function deleteUser(req, res, next) {
    const {user, session} = req
    const index = USERS_DB.findIndex(user => user.email === session.email);

    if(index === -1) {
        return error404(res, () => {
            return {success: false, message: 'user not found'}
        })
    }

    USERS_DB.splice(index, 1);

    writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
        if(err) {
            return error500(res, err);
        }
        deleteTokens(user.email);

        writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err)=> {
            if(err) {
                return error500(res, err);
            }
            return status200(res, () => {
                return JSON.stringify({success: true, message: 'user deleted successfully'})
            })
        })
    })
}

async function updatePassword(req, res) {
    try {
        const {method, headers, user} = req;
        if (method !== "PATCH") {
            return methodGuard(res);
        
        }

        if (headers["content-type"] !== "application/json") {
            return contentTypeGuard(res);
        }

        if(!user) {
            return invalidCredentials(res);
        }
        const data = await getRequestData(req, res);
        if(!data) {
            return missingParamsHandler(res);
        }

        const {currentPassword, newPassword} = JSON.parse(data);

        if(!currentPassword || !newPassword) {
            return missingParamsHandler(res);
        }

        const hashedPassword = await passwordHash(currentPassword, user.salt);
        const isEqual = timingsafeEqual(hashedPassword, user.password);

        if(!isEqual) {
            res.writeHead(400, {'content-type': 'application/json'});
            return res.end(JSON.stringify({success: false, message: 'invalid password'}));
        }

        const salt = crypto.randomBytes(16).toString('hex');
        const updatedPassword = await passwordHash(newPassword, salt);

        const updated = {password: updatedPassword, salt: salt};
        Object.assign(user, updated);

        writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
            if(err) {
                return error500(res, err)
            }

            status200(res, () => {
                return JSON.stringify({success: true, message: 'password updated successfully'})
            })
        })
    } catch (error) {
        return error500(res, error);
    }
}

module.exports = { updateUserInfo, getUser, deleteUser, updatePassword }