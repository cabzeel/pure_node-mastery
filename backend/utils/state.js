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
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BYTE_SIZE = 1024 * 1024;
const MASTER_ALLOWLIST = [
    // Documents & Presentations
    '.pdf', '.txt', '.rtf', '.odt', '.ods', '.odp', '.pages', '.numbers', '.key',
    '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.csv', '.tsv',

    // Web & Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.bmp', '.tiff', '.tif', '.ico', '.heic', '.heif',

    // Audio
    '.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma', '.aiff', '.mid', '.midi',

    // Video
    '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.mpeg', '.mpg',

    // Archives & Compressed Data
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.zipx', '.iso',

    // Code & Data Interchange
    '.json', '.xml', '.yaml', '.yml', '.html', '.htm', '.css', '.js', '.ts', '.jsx', '.tsx', 
    '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.sh', '.sql', '.md',

    // Design & 3D Models
    '.psd', '.ai', '.xd', '.fig', '.sketch', '.dwg', '.dxf', '.obj', '.stl', '.fbx', '.gltf', '.glb', '.blend',

    // Fonts
    '.ttf', '.otf', '.woff', '.woff2', '.eot'
];


module.exports = {
    USERS_DB,
    SESSIONS_DB,
    USERS_DB_FILE,
    SESSIONS_DB_FILE,
    SESSION_LIFESPAN,
    PORT,
    PUBLIC_DIR,
    MIME_TYPES,
    MAX_BYTE_SIZE,
    MASTER_ALLOWLIST
}