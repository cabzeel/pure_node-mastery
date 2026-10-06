const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");

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
      console.error("401.html file not found on disk");

      res.end(
        "<h1>401 Unauthorized</h1><p>Please register an account or log in to view this private page.</p>",
      );
      return;
    }
    res.end(file401, "utf8");
  });
}

module.exports = {
  dbLogicPrimer,
  clearDatabase,
  passwordHash,
  unauthorizedHandler,
};
