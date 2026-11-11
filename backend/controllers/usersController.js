const {passwordHash,timingsafeEqual} = require("../utils/auth");
const { writeToDB, deleteTokens, createToken } = require("../utils/db");
const { getRequestData } = require("../utils/parser");
const { status200} = require("../utils/responses");
const crypto = require("crypto");
const {USERS_DB,USERS_DB_FILE,SESSIONS_DB,SESSIONS_DB_FILE} = require("../utils/state");
const AppError = require("../middleware/AppError");

function getUser(req, res, next) {
  const { user } = req;
  return status200(res, () => {
    return JSON.stringify({
      success: true,
      user: { name: user.name, email: user.email },
    });
  });
}

async function updateUserInfo(req, res, next) {
    const { headers, user, session } = req;
    if (headers["content-type"] !== "application/json") {
      throw new AppError(415, "Unexpected Content Type");
    }

    const data = await getRequestData(req, res);
    if (!data) {
      throw new AppError(400, "Missing required arguments");
    }
    const { name, email } = JSON.parse(data);
    const existingUser = USERS_DB.find(
      (user) => user.email === email.trim().toLowerCase(),
    );

    if (existingUser && existingUser.email !== session.email) {
      throw new AppError(409, 'Email already taken')
    }
    const prev = { name: user.name, email: user.email };
    const updates = { name: name, email: email.trim().toLowerCase() };
    Object.assign(user, updates);
    writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
      if (err) {
        Object.assign(user, prev);
        throw new AppError(500, "something went wrong");
      }
      deleteTokens(session.email);
      const { token } = createToken(user.email);

      writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
        if (err) {
          throw new AppError(500, "something went wrong");
        }
        return status200(res, () => {
          return JSON.stringify({
            success: true,
            message: "user updated successfully",
            user: { name: user.name, email: user.email, token },
          });
        });
      });
    });

}

async function deleteUser(req, res, next) {
  const { user, session } = req;
  const index = USERS_DB.findIndex((user) => user.email === session.email);

  if (index === -1) {
    throw new AppError(404, 'User not found');
  }

  USERS_DB.splice(index, 1);

  await writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
    if (err) {
      throw new AppError(500, "something went wrong");
    }
    deleteTokens(user.email);

    writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
      if (err) {
        throw new AppError(500, "something went wrong");
      }
      return status200(res, () => {
        return JSON.stringify({
          success: true,
          message: "user deleted successfully",
        });
      });
    });
  });
}

async function updatePassword(req, res) {
    const { method, headers, user } = req;
    if (method !== "PATCH") {
      throw new AppError(405, "Method not Allowed");
    }

    if (headers["content-type"] !== "application/json") {
      throw new AppError(415, "Unexpected Content Type");
    }

    if (!user) {
      throw new AppError(401, "Invalid Credentials");
    }
    const data = await getRequestData(req, res);
    if (!data) {
      throw new AppError(400, "Missing required arguments");
    }

    const { currentPassword, newPassword } = JSON.parse(data);

    if (!currentPassword || !newPassword) {
      throw new AppError(400, "Missing required arguments");
    }

    const hashedPassword = await passwordHash(currentPassword, user.salt);
    const isEqual = timingsafeEqual(hashedPassword, user.password);

    if (!isEqual) {
      throw new AppError(400, 'Invalid password')
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const updatedPassword = await passwordHash(newPassword, salt);

    const updated = { password: updatedPassword, salt: salt };
    Object.assign(user, updated);

    await writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
      if (err) {
        throw new AppError(500, "something went wrong");
      }

      status200(res, () => {
        return JSON.stringify({
          success: true,
          message: "password updated successfully",
        });
      });
    });

}

module.exports = { updateUserInfo, getUser, deleteUser, updatePassword };
