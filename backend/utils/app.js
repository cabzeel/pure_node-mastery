const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const { PUBLIC_DIR, SESSIONS_DB } = require("./state");

const scrypt = promisify(crypto.scrypt);

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

async function passwordHash(password, salt) {
  const derivedKey = await scrypt(password, salt, 64);
  const hashedPassword = derivedKey.toString("hex");

  return hashedPassword;
}

function unauthorizedHandler(res, public_dir) {
  res.writeHead(401, { "content-type": "text/html" });
  fs.readFile(path.join(public_dir, "401.html"), (err401, file401) => {
    if (err401) {
      if (err401.code === ENOENT) {
        console.error("401.html file not found on disk");

        return res.end(
          "<h1>401 Unauthorized</h1><p>Please register an account or log in to view this private page.</p>",
        );
      } else {
        res.writeHead(401, {'content-type': 'application/json'})
        res.end(JSON.stringify({success: false, message: err401.message}))
      }
    }
    res.end(file401, "utf8");
  });
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

function missingParamsHandler(res) {
  res.writeHead(400, {'content-type': 'application/json'});
  return res.end(JSON.stringify({success: false, message: 'missing required arguments'}))
}

module.exports = {
  dbLogicPrimer,
  clearDatabase,
  passwordHash,
  unauthorizedHandler,
  writeToDB,
  clearExpiredTokens,
  AuthenticateToken,
  missingParamsHandler
};
