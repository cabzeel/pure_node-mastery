const fs = require('fs');

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


function writeToDB(db_file, db, callback) {
  fs.writeFile(db_file, JSON.stringify(db, null, 2), (err) => {
    if (err) {
      console.error("database write error:", err.message);
      callback(err);
      return;
    }

    callback(null);
  });
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
      if (err) {
        console.log(err);
        return;
      }
      console.log(`${count} tokens deleted successfully`);
    });
  }
}

module.exports = {clearDatabase, clearExpiredTokens, dbLogicPrimer, writeToDB}