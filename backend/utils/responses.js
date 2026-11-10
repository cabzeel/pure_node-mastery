const fs = require('fs');
const path = require('path');
const { MIME_TYPES } = require('./state');

function contentTypeGuard(res) {
  res.writeHead(415, {'content-type' : 'application/json'});
  return res.end(JSON.stringify({success: false, message: 'unexpected content type'}))
}


function methodGuard(res) {
  res.writeHead(405, { "content-type": "application/json" });
  return res.end(JSON.stringify({ success: false, message: "Method Not Allowed" }));

}

function error500(res, err) {
  res.writeHead(500, {"content-type": 'application/json'});
  return res.end(JSON.stringify({success: false, message: err.message}))
}

function invalidCredentials(res) {
  res.writeHead(401, {'content-type': 'application/json'});
  return res.end(JSON.stringify({success: false, message: 'invalid credentials'}));
}



function missingParamsHandler(res) {
  res.writeHead(400, { "content-type": "application/json" });
  return res.end(
    JSON.stringify({ success: false, message: "missing required arguments" }),
  );
}


function byteSizeHandler(req, res) {
  res.writeHead(413, { "content-type": "application/json" });
  res.end(JSON.stringify({ success: false, message: "payload too large" }));
  res.on('finish', ()=> req.destroy());
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
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: false, message: err401.message }));
      }
    }
    res.end(file401, "utf8");
  });
}

function status200(res, callback) {
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(callback())
}

function error404(res, cb) {
  res.writeHead(404, {'content-type': 'application/json'});
  return res.end(JSON.stringify(cb())) 
}

function errorConflict(res, cb) {
  res.writeHead(409, {'content-type': 'application/json'});
  return res.end(JSON.stringify(cb()));
}

function handleImageServing(res, filepath) {
  if(!filepath) {
    res.writeHead(404, {'content-type': 'application/json'});
    return res.end(JSON.stringify({success: false, message: 'invalid path'}));
  }
  fs.readFile(filepath, (err, data) => {
    if(err) {
      res.writeHead(404, {'content-type': 'application/json'});
      return res.end(JSON.stringify({success: false, message: 'invalid path'}));
    }

  })
}


module.exports = { handleImageServing,unauthorizedHandler, byteSizeHandler, missingParamsHandler, invalidCredentials, error500, methodGuard, contentTypeGuard, status200, error404, errorConflict};