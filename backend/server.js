const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dbLogicPrimer, clearDatabase, passwordHash, writeToDB } = require('./utils/app');

//declare global variables...
const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const USERS_DB = [];
const SESSIONS_DB = {};
const USERS_DB_FILE = path.join(__dirname, 'db', 'users.json');
const SESSIONS_DB_FILE = path.join(__dirname, 'db', 'sessions.json');
const SESSION_LIFESPAN = 15 * 60 * 1000;


// load databases:
dbLogicPrimer(USERS_DB, USERS_DB_FILE)
dbLogicPrimer(SESSIONS_DB, SESSIONS_DB_FILE);


//mime types:
const MIME_TYPES = {
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  '.jpg': 'image/JPEG'
}

const server = http.createServer((req, res) => {
  const {url, method} = req;
  const fileName = url === '/' ? 'signup.html' : url;
  //filepath
  const filePath = path.join(PUBLIC_DIR, fileName)
  //setting mime type:
  const ext = path.extname(fileName);
  const contentType  = MIME_TYPES[ext] || 'application/octet';

  //sign up functionality:
  if(url === '/api/signup' && method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    })

    req.on('end', async() => {
      const parsedData = JSON.parse(body);
      //check if user already exists...
      const incomingEmail = parsedData.email.trim().toLowerCase();
      const isExisting = USERS_DB.find(user => user.email === incomingEmail);

      if(isExisting) {
        res.writeHead(409, {"content-type": 'application/json'});
        res.end(JSON.stringify({
          success: false, message: 'error: user already exists'
        }))
        return;
      }
      //hash password and create new user
      const salt = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await passwordHash(parsedData.password, salt);
      const id = crypto.randomUUID();
      //create new user object...
      const newUser = {
        id : id,
        name: parsedData.name,
        password: hashedPassword,
        email: incomingEmail,
        salt: salt
      }
      //save user to db
      USERS_DB.push(newUser);
      //write user to db file
      writeToDB(USERS_DB_FILE, USERS_DB, (err) => {
        if(err) {
          res.writeHead(500, {"content-type": 'application/json'});
          return res.end(JSON.stringify({success: false, message: err.message}));
        }
        //create token:
        const token = crypto.randomBytes(32).toString('hex');
        SESSIONS_DB[token] = {
          email: newUser.email,
          createdAt: Date.now()
        }
        //write token to db file
        writeToDB(SESSIONS_DB_FILE, SESSIONS_DB, (err) => {
          if(err) {
            res.writeHead(500, {"content-type": 'application/json'});
            return res.end(JSON.stringify({success: false, message: err.message}));
          }

          res.writeHead(200, {"content-type": 'applicaiton/json'});
          return res.end(JSON.stringify({success: true, user: {
            name: newUser.name,
            email: newUser.email,
            token: token
          }}));
        })
      })
    })
    return;
  }

  //login functionality...
  if(url.startsWith('/api/login') && method === 'POST') {
    //extract token from
  }


//server file serving functionality
  fs.readFile(filePath, (err, file) => {
    if(err) {
      if(err.code === 'ENOENT') {
        fs.readFile(path.join(PUBLIC_DIR, '404.html'), (err404, file404) => {
          if(err404) {
            res.writeHead(500, {"content-type": 'application/json'});
            res.end(JSON.stringify({
              success: false, msg: 'resource does not exist on server'
            }));
            return;
          }
          res.writeHead(404, {"content-type": contentType});
          res.end(file404, 'utf8');
          return;
        })
        return;
      } else {
        res.writeHead(500, {"content-type": 'application/json'});
        res.end(JSON.stringify({
          success: false,
          message: 'Sorry, an internal server error ocurred'
        }));
        return;
      }
    }

    res.writeHead(200, {"content-type": contentType});
    res.end(file, 'utf8')
  })

})

server.listen(3000, ()=> console.log(`server running at http://localhost:${PORT}`));
