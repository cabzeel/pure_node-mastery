const {promisify} = require('util');
const crypto = require('crypto');
const { SESSIONS_DB, SESSIONS_DB_FILE, USERS_DB, PUBLIC_DIR } = require('./state');
const {unauthorizedHandler} = require('./responses')

const scrypt = promisify(crypto.scrypt);

async function passwordHash(password, salt) {
  const derivedKey = await scrypt(password, salt, 64);
  const hashedPassword = derivedKey.toString("hex");

  return hashedPassword;
}

function AuthenticateToken(res, token) {
  if (!token) {
    unauthorizedHandler(res, PUBLIC_DIR);
    return false;
  }

  if (!SESSIONS_DB[token]) {
    unauthorizedHandler(res, PUBLIC_DIR);
    return false;
  }
  return true;
}

// function extractTokenAndUser(req, res) {
//   const authHeader = req.headers['authorization'];
//   if(!authHeader) {
//     res.writeHead(404, {'content-type': 'application/json'})
//     res.end(JSON.stringify({success: false, message: 'missing auth header'}));
//     return;
//   }
//   const [scheme, tokenParam] = authHeader.split(' ');

//   if(scheme !== 'Bearer' || !tokenParam) {
//     unauthorizedHandler(res, PUBLIC_DIR);
//     return null;
//   }
//   const session = SESSIONS_DB[tokenParam];
  
//   if(!session) {
//     unauthorizedHandler(res, PUBLIC_DIR);
//     return null
//   }

//   const user = USERS_DB.find(user => user.email === session.email);
//   if(!user || !tokenParam) {
//     unauthorizedHandler(res, PUBLIC_DIR);
//     return null;
//   }
//   return {tokenParam, user};
// }


function timingsafeEqual(passwordA, passwordB) {
  // 1. Coerce to strings to guarantee .update() works without crashing
  const strA = String(passwordA);
  const strB = String(passwordB);

  // 2. Hash the raw strings directly. SHA-256 normalizes both to exactly 32-byte buffers.
  const hashA = crypto.createHash('sha256').update(strA).digest();
  const hashB = crypto.createHash('sha256').update(strB).digest();

  // 3. Safely compare identical-length buffers
  return crypto.timingSafeEqual(hashA, hashB);
}



module.exports = {timingsafeEqual, AuthenticateToken, passwordHash}