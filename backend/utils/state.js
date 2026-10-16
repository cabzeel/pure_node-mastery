const path = require('path');

const USERS_DB = [];
const SESSIONS_DB = {};
const USERS_DB_FILE = path.join(__dirname, 'db', 'users.json');
const SESSIONS_DB_FILE = path.join(__dirname, 'db', 'sessions.json');
const SESSION_LIFESPAN =  15 * 60 * 1000;

//declare global variables...
const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
module.exports = {
    USERS_DB,
    SESSIONS_DB,
    USERS_DB_FILE,
    SESSIONS_DB_FILE,
    SESSION_LIFESPAN,
    PORT,
    PUBLIC_DIR
}