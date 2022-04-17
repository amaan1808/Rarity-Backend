const multer = require("multer");

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new Error("Not an Image! Please upload an Image.", 400), false);
  }
};

var storage = multer.memoryStorage();
var upload = multer({ storage: storage, fileFilter: multerFilter });

module.exports = upload;
