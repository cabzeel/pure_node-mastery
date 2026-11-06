const { passwordHash, timingsafeEqual, extractTokenAndUser } = require("../utils/auth");
const { getRequestData } = require("../utils/parser");
const { methodGuard, contentTypeGuard, error500, status200, missingParamsHandler, invalidCredentials } = require("../utils/responses");
const crypto = require('crypto');
const { USERS_DB, USERS_DB_FILE, SESSIONS_DB, SESSIONS_DB_FILE } = require("../utils/state");
const { writeToDB, deleteTokens, createToken } = require("../utils/db");
const path = require('path')

async function signUp(req, res) {
    try {
        const {method, url, headers} = req;

        if(method !== 'POST') {
            methodGuard(res);
            return;
        }

        if(headers['content-type'] !== 'application/json') {
            return contentTypeGuard(res);
        }
        //get request data..
        const body = await getRequestData(req, res);

        const parsedData = JSON.parse(body);
        console.log(parsedData);
        const {name, email, password} = parsedData;
        //verify if user containing said email exists..
        const existingUser = USERS_DB.find(user => user.email === email.trim().toLowerCase())

        if(existingUser) {
            res.writeHead(409, {'content-type': 'application/json'});
            return res.end(JSON.stringify({success: false, message: 'user already exists'}));
        }
        // create user object 
        const id = crypto.randomUUID();
        const salt = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await passwordHash(password, salt);
        //prepare path for future profile pic upload
        const picMetaData = {
            filepath: path.resolve(__dirname, '../uploads/default.webp'),
            id: '',
            size: 0
        }
        const user = {
            id,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            salt,
            picMetaData
        }

        USERS_DB.push(user);
        //write to file
        writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
            if(err) {
                return error500(res, err)
            }
            //create a token for the user...
            const {token} = createToken(user.email);
            //write to DB
            writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
                if(err) {
                    return error500(res, err);
                }
                return status200(res, () => {
                    return JSON.stringify({success: true, user: {
                        name: user.name,
                        email: user.email,
                        token: token
                    }});
                })
            })
        })

    } catch (error) {
        return error500(res, error);
    }

}

async function logIn(req, res) {
    const {headers, method} = req
    try {
        if(method !== 'POST') {
            return methodGuard(res);
        }

        if(headers['content-type'] !== 'application/json') {
            return contentTypeGuard(res);
        }

        const body = await getRequestData(req, res);

        const {email, password} = JSON.parse(body);
        if(!email || !password) {
            return missingParamsHandler(res);
        }
        //check if user exists
        const user = USERS_DB.find(user => user.email === email.trim().toLowerCase());
        if(!user) {
            return invalidCredentials(res);
        }

        const hashedPassword = await passwordHash(password, user.salt)
        const isEqual = timingsafeEqual(user.password, hashedPassword);
        console.log(isEqual)
        if(!isEqual) {
            return invalidCredentials(res);
        }
        deleteTokens(user.email);
        const {token, sessions} = createToken(user.email)
        
        //write to db
        writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
            if(err) {
                return error500(res, err);
            }
            status200(res, () => {
                return JSON.stringify({success: true, user: {
                    name: user.name, email: user.email, token
                }})
            })
            return;
        })
    } catch (error) {
        return error500(res, error);
    }
}

async function logOut(req, res) {
    const {method} = req;
    if (method !== "POST") {
        methodGuard(res);
        return;
    }

    const auth = extractTokenAndUser(req, res);
      if (!auth) {
        return;
      }
    const { tokenParam, user } = auth;
      //find all tokens for that user and delete
    deleteTokens(user.email);

    writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
        if (err) {
            error500(res, err);
            return;
        }

        status200(res, ()=> {
            return JSON.stringify({ success: true, message: "logout successful" })
        })
    });
      

}

module.exports = { signUp, logIn, logOut }