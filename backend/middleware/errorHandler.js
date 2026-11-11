const AppError = require("./AppError");

function errorHandler(err, req, res) {
    if(res.headersSent) {
        console.log(err);
        return res.end()
    }
    else if(err instanceof AppError) {
        res.writeHead(err.statusCode, {'content-type':'application/json'});
        return res.end(JSON.stringify({success: false, message: err.message}))
    } else {
        console.log(err)
        res.writeHead(500, {'content-type': 'application/json'});
        return res.end(JSON.stringify({success: false, message: 'something went wrong'}))
    }
}

module.exports = errorHandler;