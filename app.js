const appRoot = require("app-root-path");
const config = require(appRoot + "/config/config.js");
var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");

var indexRouter = require("./routes/index");
var punksRouter = require("./routes/punks");
const uploadsRouter = require("./routes/upload");

var app = express();

app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
    preflightContinue: false,
  })
);

if (app.get("env") === "development") {
  var livereload = require("easy-livereload");
  app.use(
    livereload({
      app: app,
    })
  );
}

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.locals.app_name = config.app_name;
app.locals.ga_code = config.ga;
app.locals.collection_contract_address = config.collection_contract_address;
app.locals.collection_name = config.collection_name;
app.locals.collection_id_from = config.collection_id_from;
app.locals.content_image_is_video = config.content_image_is_video;
app.locals.content_image_frame = config.content_image_frame;
app.locals.item_path_name = config.item_path_name;
app.locals.use_wallet = config.use_wallet;

app.use("/api", indexRouter);
app.use("/api/:collectionName", punksRouter); // +config.istem_path_name
app.use("/api/upload-image", uploadsRouter); // +config.istem_path_name

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  next();
  // res.locals.message = err.message;
  // res.locals.error = req.app.get('env') === 'development' ? err : {};

  // // render the error page
  // res.status(err.status || 500);
  // res.status(200).json('error');
});

module.exports = app;
