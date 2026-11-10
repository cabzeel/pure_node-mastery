const multipartStreamParser = require("../middleware/multipart_processor");
const optimizeImg = require("../middleware/optimizeImg");
const { error500, error404, byteSizeHandler } = require("./responses");
const { MAX_BYTE_SIZE } = require("./state");
const crypto = require('crypto');
const fs = require('fs');

function getRequestData(req, res) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bodyLength = 0;
    
    req.on('data', (chunk) => {
      bodyLength += chunk.length;
      if(bodyLength > MAX_BYTE_SIZE) {
        byteSizeHandler(req, res);
        req.destroy();
        return reject(new Error('maximum byte size exceeded'));
      }
      body += chunk;
    });

    req.on('end', () => {
      if (req.destroyed) return;
      resolve(body);
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

//handle image uploads..receive the data, verify if data is an image 
async function processImg(req, res) {
  try {
    const parser = new multipartStreamParser(req, res);
    const data = await parser.startParsing();
    const filePath = await optimizeImg(data.filepath);
    data.filepath = filePath;
    return data;
  } catch (error) {
    error500(res, error);
  }
}

function serveImg(res, path) {
  fs.readFile(path, (err, file) => {
    if(err) {
      return error404(res, () => {
        return {success: false, message: err.message}
      })
    }
    res.writeHead(200, {'content-type': 'image/webp'});
    res.end(file);
  })
}
module.exports = {getRequestData, processImg, serveImg}