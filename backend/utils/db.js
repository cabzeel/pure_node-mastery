const fs = require('fs');
const fsP = require('fs').promises;
const { SESSIONS_DB, SESSIONS_DB_FILE, USERS_DB, USERS_DB_FILE, POSTS_DB, POSTS_DB_FILE, WORKOUTS_DB, WORKOUTS_DB_FILE } = require('./state');
const crypto = require('crypto');
const AppError = require('../middleware/AppError');

function dbLogicPrimer(db, filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf8");

      if (data.trim() != "") {
        const parsedData = JSON.parse(data);
        if (Array.isArray(parsedData)) {
          db.push(...parsedData);
        } else {
          Object.assign(db, parsedData);
        }
        return true;
      }
    } catch (error) {
      console.error(`Error loading database at ${filePath}:`, error.message);
      clearDatabase(db);
      return false;
    }
  }
}

function clearDatabase(db) {
  if (Array.isArray(db)) {
    db.length = 0;
  } else {
    for (const key in db) {
      delete db[key];
    }
  }
}


async function writeToDB(db_file, db, callback) {
  try {
    await fsP.writeFile(db_file, JSON.stringify(db, null, 2));
    if (callback) return callback(null)
    
  } catch (error) {
    console.error(error);
    if(callback) return callback(error);
    throw new AppError(500, 'something went wrong')
  }
}

function clearExpiredTokens(db, db_file, session_lifespan) {
  let count = 0;
  for (const [token, { createdAt }] of Object.entries(db)) {
    const isExpired = Date.now() - createdAt > session_lifespan;
    if (isExpired) {
      delete db[token];
      count++;
    }
  }
  if (count === 0) {
    console.log("no expired tokens");
  } else {
    writeToDB(db_file, db, (err) => {
      
      console.log(`${count} tokens deleted successfully`);
    });
  }
}

function deleteTokens(userEmail) {
  const tokensToDelete = [];
  for(const [token, {email}] of Object.entries(SESSIONS_DB)) {
    if(userEmail === email) {
      tokensToDelete.push(token);
    }
  }
  for(const token of tokensToDelete) {
    delete SESSIONS_DB[token];
  }
}

function createToken(email) {
  const token = crypto.randomBytes(32).toString('hex');
  SESSIONS_DB[token] = {
    email: email,
    createdAt: Date.now()
  }

  return {token, session: SESSIONS_DB[token]}
}

function loadDatabases() {
  dbLogicPrimer(USERS_DB, USERS_DB_FILE);
  dbLogicPrimer(SESSIONS_DB, SESSIONS_DB_FILE);
  dbLogicPrimer(POSTS_DB, POSTS_DB_FILE);
  dbLogicPrimer(WORKOUTS_DB, WORKOUTS_DB_FILE);
}


module.exports = {clearDatabase, clearExpiredTokens, dbLogicPrimer, writeToDB, deleteTokens, createToken, loadDatabases}