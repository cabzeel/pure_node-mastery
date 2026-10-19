const path = require('path');

const USERS_DB = [];
const SESSIONS_DB = {};
const POSTS_DB = [];
const WORKOUTS_DB = [];
const USERS_DB_FILE = path.join(__dirname, '..', 'db', 'users.json');
const SESSIONS_DB_FILE = path.join(__dirname, '..', 'db', 'sessions.json');
const SESSION_LIFESPAN =  15 * 60 * 1000;
const MIME_TYPES = {
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  '.jpg': 'image/JPEG'
}

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BYTE_SIZE = 1024 * 10;
module.exports = {
    USERS_DB,
    SESSIONS_DB,
    USERS_DB_FILE,
    SESSIONS_DB_FILE,
    SESSION_LIFESPAN,
    PORT,
    PUBLIC_DIR,
    MIME_TYPES,
    MAX_BYTE_SIZE
}