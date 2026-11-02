const { MAX_BYTE_SIZE } = require("./state");

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

module.exports = {getRequestData, }