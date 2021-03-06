const appRoot = require("app-root-path");

const express = require("express");
const Database = require("better-sqlite3");
const uploadImage = express.Router();

const fs = require("fs");

// const { sqlQuery } = require("../dbMysql");

const s3 = require("./s3.config.js");
const upload = require("./multer.config.js");

var multer = upload.single("image");

uploadImage.post("/", async (req, res) => {
  multer(req, res, async (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        errors: {
          message: "Only image accepted",
        },
      });
    }
    if (!req.file) {
      return res.status(500).json({
        success: false,
        errors: {
          message: "Image not added",
        },
      });
    }
    const s3Client = s3.s3Client;

    const { id, collection_name } = req.body;
    const collection_name_lowercase = collection_name.toLowerCase();

    if (!(id && collection_name)) {
      return res.status(400).json({
        success: false,
        message: "Please enter id and collection name",
      });
    }

    const params = {
      Bucket: `rarity-assets/${collection_name_lowercase}`,
      Key: "", // pass key
      Body: null, // pass file body
    };

    params.Key = req?.file?.originalname;

    params.Body = req?.file?.buffer;
    params.ACL = "public-read";

    s3Client.upload(params, async (err, data) => {
      if (err) {
        res.status(500).json({ error: "Error -> " + err });
      }

      const imageUrl = data.Location;

      if (imageUrl) {
        let config;

        try {
          fs.readdirSync(appRoot + "/config/").forEach((file) => {
            if (file.endsWith(".js")) {
              config = require(appRoot + "/config/" + file);

              if (
                config?.collection_name?.toLowerCase() ===
                collection_name_lowercase
              ) {
                const databasePath =
                  appRoot + "/config/" + config.sqlite_file_name;

                if (!fs.existsSync(databasePath)) {
                  console.log("Database not exist.");
                  return;
                }

                const db = new Database(databasePath);

                const dbCollectionName = file.split("_config")[0];

                const updateCollectionItemImage = db.prepare(
                  `UPDATE ${dbCollectionName}s SET image = :image WHERE id = :id`
                );

                updateCollectionItemImage.run({
                  image: imageUrl,
                  id,
                });
              }
            }
          });
        } catch (err) {
          console.log(err);
          return res.status(400).json({
            success: false,
            message: "Id or Collection name invalid",
          });
        }

        return res.status(200).json({
          success: true,
          message: "File Uploaded",
          imageUrl,
        });
      }
      return res.status(400).json({
        success: false,
        message: "Upload Failed",
      });
    });
  });
});

module.exports = uploadImage;
