var app     = require("../server.js");
var mysql   = require("mysql");
var bcrypt  = require("bcrypt");
var multer  = require("multer");
var emailer = require("nodemailer");
var fs      = require("fs");
var path    = require("path");
var crypto  = require("crypto");

var upload = multer({"dest":"temp"});

app.get("/", function(req, res){
  res.render("index.ejs");
});

app.get("/verify", function(req, res){
  var token = req.query["token"];
  var sendToUser = {};
  var sql   = `SELECT users_id, token FROM verification_tokens WHERE token=?`;
  var args  = [token];

  conn.query(sql, args, function(err, rows){
    if(rows.length){
      var users_id = rows[0]["users_id"];
      var token    = rows[0]["token"];
      var sql      = `DELETE FROM verification_tokens WHERE token=?`;
      var args     = [token];

      conn.query(sql, args, function(err, rows){
        var sql  = `UPDATE users SET verified=? WHERE id=?`;
        var args = [1, users_id];

        conn.query(sql, args, function(err, rows){
          sendToUser["data"] = "Your account has been successfully verified.";
          res.render("verify.ejs", sendToUser);
        });
      });
    }else{
      sendToUser["data"]  = "That token is invalid. Either the token for that user doesn't exist, ";
      sendToUser["data"] += "or they have already been verified.";
      res.render("verify.ejs", sendToUser);
    }
  });
});

function MySqlConnection(){
  fs.readFile("config.json", "utf-8", (error, data) => {
    if(error){
      console.log(error);
      // resolve(1);
      return;
    }

    data = JSON.parse(data);

    conn = mysql.createConnection({
      host    : data["host"],
      user    : data["user"],
      password: data["password"],
      database: data["database"]
    });
  });
}

MySqlConnection();

function Frysta(){}

Frysta.prototype.CreateAccount = function(data){return new Promise((resolve) => {
  resolve({"a":"b"});
})}

var privateKeyFile = path.resolve("private.key");
var privateKey = fs.readFileSync(privateKeyFile, "utf-8");

function ServerDecryptsData(encryptedData){
  encryptedData = Buffer.from(encryptedData, "base64");
  var decryptedData = crypto.privateDecrypt(privateKey, Buffer.from(encryptedData));
  var decryptedData = decryptedData.toString("utf-8");
  return JSON.parse(decryptedData);
}

GenerateToken = function(){return new Promise((resolve) => {
  var processing = false;
  var timer      = setInterval(function(){
    if(!processing){
      processing = true;
      crypto.randomBytes(6, function(err, buffer){
        // Six bytes to base64 is a string that's 8 characters long
        var token = buffer.toString("base64");
        token     = encodeURIComponent(token); // Ensure that's safe for URLs
        var sql   = `SELECT id FROM verification_tokens WHERE token=?`;
        var args  = [token];

        conn.query(sql, args, function(err, rows){
          if(rows.length)
            processing = false; // Token already exists, try again
          else{
            processing = false;
            clearInterval(timer);
            resolve(token);
          }
        });
      });
    }
  }, 100);
})}

app.post("/create-account", function(req, res){
  var decryptedData = ServerDecryptsData(req["body"]["data"]);
  var email         = decryptedData["email"];
  var username      = decryptedData["username"];
  var password      = decryptedData["password"];

  // Ensure that the email, username, and password are all valid

  // Hash the password
  bcrypt.hash(password, 10, function(err, hashedPassword){

    // Check if the username exists
    var sql  = `SELECT id FROM users WHERE username=?`;
    var args = [username];

    conn.query(sql, args, function(err, rows){
      if(rows.length){
        // User already exists
        res.json({"msg":"User already exists", "err":"true"});
      }else{
        // Insert the user
        var sql  = `INSERT INTO users (username, email, password, create_date) VALUES (?,?,?,NOW())`;
        var args = [username, email, hashedPassword];

        conn.query(sql, args, function(err, rows){
          var users_id = rows.insertId;
          // Generate the verification token after the user was created
          GenerateToken()
          .then((token) => {
            var sql  = `INSERT INTO verification_tokens (users_id, token) VALUES (?,?)`;
            var args = [users_id, token];

            conn.query(sql, args, function(err, rows){

              var transporter = emailer.createTransport({
                service: "gmail",
                auth: {
                  user: "fizz.gg.site@gmail.com",
                  pass: "PASSWORD_GOES_HERE"
                }
              });

              var mailOptions = {
                "from"   : "fizz.gg.site@gmail.com",
                "to"     : email,
                "subject": "Your verification code for fizz.gg",
                "text"   : `https://fizz.gg/verify?token=${token}`
              };

              transporter.sendMail(mailOptions, function(error, info){
                res.json({"msg":"User created", "err":"false"});
              });
            });
          });
        });
      }
    });
  });
});

app.post("/login", function(req, res){
  var decryptedData = ServerDecryptsData(req["body"]["data"]);

  var username = decryptedData["username"];
  var password = decryptedData["password"];

  // Pull the hash from the database
  var sql  = `SELECT password FROM users WHERE username=?`;
  var args = [username];

  conn.query(sql, args, function(err, rows){
    if(rows.length == 0){
      res.json({"msg":"Incorrect username/password", "err":"true"});
    }else{
      var hashedPassword = rows[0]["password"];

      bcrypt.compare(password, hashedPassword, function(err, res2){
        if(res2){
          res.json({"msg":"Logged in", "err":"false"});
        }else{
          res.json({"msg":"Incorrect username/password", "err":"true"});
        }
      });
    }
  });
})

app.post("/send-screenshot", upload.any(), function(req, res, next){
  var body = req.body;
  var files = req.files;

  if(files.length > 1){
    res.json("Error: User tried to upload more than one file");
    return;
  }

  // console.log("===============================================");
  // console.log(body["key"]);
  // console.log("===============================================");

  var fileOrig = files[0]["originalname"];
  var fileName = files[0]["filename"];
  var filePath = files[0]["path"];
  var fileSize = files[0]["size"];
  var fileType = files[0]["mimetype"];

  if(fileType != "image/png"){
    res.json("Error: Invalid MIMEtype");
    return;
  }

  var newName = "";
  var characters = [
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  ];

  for(var i = 0; i < 6; i++)
    newName += characters[Math.floor(Math.random() * 62)];
  newName += ".png";

  var input  = fs.createReadStream(filePath);
  var output = fs.createWriteStream("static/uploads/" + newName);

  input.pipe(output);

  input.on("end", function(){
    var obj = {
      "url": "https://fizz.gg/" + newName
    };

    res.json(obj);

    fs.unlink(filePath, (err) => {
      if(err)
        throw err;
    });
  });
});

app.use(function (req, res){
  res.render("404.ejs");
});
