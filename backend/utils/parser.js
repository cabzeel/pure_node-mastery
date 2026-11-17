const path = require("path");
const AppError = require("../middleware/AppError");
const multipartStreamParser = require("../middleware/multipart_processor");
const optimizeImg = require("../middleware/optimizeImg");
const { byteSizeHandler } = require("./responses");
const { MAX_BYTE_SIZE, CATEGORY_LIST, PUBLIC_DIR, MIME_TYPES } = require("./state");
const fsP = require('fs').promises;

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
    console.error(error.message);
    throw new AppError(500, error.message)
  }
}
async function cleanAndValidateFields(data) {
    
  let {title, body, category, allowComments, tags} = data;
  if(typeof title !== 'string' || typeof body !== 'string' || !Array.isArray(JSON.parse(tags))) {
    throw new AppError(400, 'Unexpected data type')
  }
  if(title.length < 3 || title.length > 100 || body.length < 10 || body.length > 2000) {
    throw new AppError(400, 'Invalid payload size');
  }
  title = title.trim();
  body = body.trim();
  //category
  if(!CATEGORY_LIST.includes(category)) {
    throw new AppError(400, 'unrecognized category')
  }
  category.trim();
  allowComments === 'true' ? allowComments = true : allowComments = false;
  //tags
  tags = JSON.parse(tags);
  tags = [...new Set(
  tags
    .map(tag => tag.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20))
    .filter(Boolean)
  )].slice(0, 5);
  const result = {title, body, category, allowComments, tags};
  return result;
}

//file serving function
async function fileServingFunctionality(req, res) {
  const {url} = req;
  const filename = url === '/' ? '/signup.html': url;
  const filepath = path.join(PUBLIC_DIR, filename);
  const ext = path.extname(filepath);
  const contentType = MIME_TYPES[ext] || 'application/octet';

  try {
    const data = await fsP.readFile(filepath);
    res.writeHead(200, { 'content-type': contentType });
    return res.end(data); 
  } catch (error) {
      if (error.code === 'ENOENT') {
        const notFoundPage = await fsP.readFile(path.join(PUBLIC_DIR, '404.html'));
        res.writeHead(404, { 'content-type': 'text/html' });
        return res.end(notFoundPage);
      }

  // Only log unexpected server errors (not normal 404s)
  console.error(error);
  res.writeHead(500, { 'content-type': 'text/plain' });
  return res.end('500 Internal Server Error');
}


}
module.exports = {getRequestData, processImg, cleanAndValidateFields, fileServingFunctionality}
