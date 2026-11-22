const fs = require("fs");
const {
  status200,
} = require("../utils/responses");
const { serveImg, processImg } = require("../utils/parser");
const path = require("path");
const { writeToDB } = require("../utils/db");
const { USERS_DB_FILE, USERS_DB } = require("../utils/state");
const AppError = require("../middleware/AppError");

async function updateProfilePic(req, res, next) {
  const {user} = req;
    const data = await processImg(req, res);
    user.picMetaData = data;

    writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
      return status200(res, () => {
        return JSON.stringify({
          success: true,
          message: "profile pic updated successfully",
          imagePath: user.picMetaData.filepath,
        });
      });
    });

}

function deleteProfilePic(req, res, next) {
  const {user} = req;
  const imgPath = user.picMetaData.filepath;
  //remove current pic
  fs.unlinkSync(imgPath);
  //set new filePath to the default
  user.picMetaData.filepath = path.resolve(
    __dirname,
    "../public/uploads/default.webp",
  );
  //write changes to DB..
  writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
    if (err) {
      throw new AppError(500, "something went wrong");
    }
    return status200(res, () => {
      return JSON.stringify({
        success: true,
        message: "profile pic removed successfully",
      });
    });
  });
}
module.exports = { updateProfilePic, deleteProfilePic };
