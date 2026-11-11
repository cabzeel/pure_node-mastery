const { error404, unauthorizedHandler } = require("../utils/responses");
const { PUBLIC_DIR, SESSIONS_DB, USERS_DB } = require("../utils/state");
const AppError = require("./AppError");

function extractTokenAndUser(req, res, next) {
    const authHeader = req.headers['authorization'];
    if(!authHeader) {
        throw new AppError(404, 'missing auth headers')
    }
    const [scheme, tokenParam] = authHeader.split(' ');
    if(scheme !== 'Bearer' || !tokenParam) {
        return unauthorizedHandler(res, PUBLIC_DIR);
    }
    const session = SESSIONS_DB[tokenParam];
    if(!session) {
        return unauthorizedHandler(res, PUBLIC_DIR);
    }

    const user = USERS_DB.find(user => user.email === session.email);
    if(!user) {
        return unauthorizedHandler(res, PUBLIC_DIR);
    }
    req.user = user;
    req.tokenParam = tokenParam;
    req.session = session;
    next();
}

module.exports = extractTokenAndUser