const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const { PUBLIC_DIR, SESSIONS_DB, MAX_BYTE_SIZE, USERS_DB, SESSION_LIFESPAN } = require("./state");







module.exports = {
  dbLogicPrimer,
  clearDatabase,
  passwordHash,
  unauthorizedHandler,
  writeToDB,
  clearExpiredTokens,
  AuthenticateToken,
  missingParamsHandler,
  byteSizeHandler,
  contentTypeGuard,
  extractTokenAndUser,
  methodGuard, 
  error500,
  invalidCredentials,
  timingsafeEqual, 
  getRequestData
};
