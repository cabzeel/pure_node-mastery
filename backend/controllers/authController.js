const { passwordHash,timingsafeEqual} = require("../utils/auth");
const { getRequestData } = require("../utils/parser");
const { status200 } = require("../utils/responses");
const crypto = require("crypto");
const {USERS_DB,USERS_DB_FILE,SESSIONS_DB,SESSIONS_DB_FILE} = require("../utils/state");
const { writeToDB, deleteTokens, createToken } = require("../utils/db");
const path = require("path");
const AppError = require("../middleware/AppError");

async function signUp(req, res) {
  const { method, url, headers } = req;

  if (method !== "POST") {
    throw new AppError(405, "Method not Allowed");
    return;
  }

  if (headers["content-type"] !== "application/json") {
    throw new AppError(415, "Unexpected Content Type");
  }
  //get request data..
  const body = await getRequestData(req, res);

  const parsedData = JSON.parse(body);
  const { name, email, password } = parsedData;
  //verify if user containing said email exists..
  const existingUser = USERS_DB.find(
    (user) => user.email === email.trim().toLowerCase(),
  );

  if (existingUser) {
    throw new AppError(409, 'User already exists')
  }
  // create user object
  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString("hex");
  const hashedPassword = await passwordHash(password, salt);
  //prepare path for future profile pic upload
  const picMetaData = {
    filepath: path.resolve(__dirname, "../uploads/default.webp"),
    id: "",
    size: 0,
  };
  const user = {
    id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: hashedPassword,
    salt,
    picMetaData,
  };
  USERS_DB.push(user);
  //write to file
  await writeToDB(USERS_DB_FILE, USERS_DB, () => {
    //create a token for the user...
    const { token } = createToken(user.email);
    //write to DB
    writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, () => {
      return status200(res, () => {
        return JSON.stringify({
          success: true,
          user: {
            name: user.name,
            email: user.email,
            token: token,
          },
        });
      });
    });
  });
}

async function logIn(req, res) {
  const { headers, method } = req;
  if (method !== "POST") {
    throw new AppError(405, "Method not Allowed");
  }

  if (headers["content-type"] !== "application/json") {
    throw new AppError(415, "Unexpected content type");
  }

  const body = await getRequestData(req, res);

  const { email, password } = JSON.parse(body);
  if (!email || !password) {
    throw new AppError(400, "Missing required arguments");
  }
  //check if user exists
  const user = USERS_DB.find(
    (user) => user.email === email.trim().toLowerCase(),
  );
  if (!user) {
    throw new AppError(401, "Invalid Credentials");
  }

  const hashedPassword = await passwordHash(password, user.salt);
  const isEqual = timingsafeEqual(user.password, hashedPassword);
  if (!isEqual) {
    throw new AppError(401, "Invalid Credentials");
  }
  deleteTokens(user.email);
  const { token } = createToken(user.email);

  //write to db
  await writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, () => {
    status200(res, () => {
      return JSON.stringify({
        success: true,
        user: {
          name: user.name,
          email: user.email,
          token,
        },
      });
    });
    return;
  });
}

async function logOut(req, res, next) {
  const { method, user } = req;
  console.log(user);
  if (method !== "POST") {
    throw new AppError(405, "Method not Allowed");
  }

  //find all tokens for that user and delete
  deleteTokens(user.email);

  await writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, () => {
    status200(res, () => {
      return JSON.stringify({ success: true, message: "logout successful" });
    });
  });
}

module.exports = { signUp, logIn, logOut };
