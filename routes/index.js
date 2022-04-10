const appRoot = require("app-root-path");
// var config = require(appRoot + "/config/config.js");
const { rarity_analyze } = require(appRoot + "/cmd/rarity_analyze");
const { rarity_analyze_normalized } = require(appRoot +
  "/cmd/rarity_analyze_normalized");
const request = require("sync-request");
const express = require("express");
const router = express.Router();
const Web3 = require("web3");
const fs = require("fs");
const Database = require("better-sqlite3");
const _ = require("lodash");
const formidable = require("formidable");
const { captureRejectionSymbol } = require("events");

/* GET home page. */
router.get("/:collectionName", function (req, res, next) {
  const config = require(appRoot +
    `/config/${req.params.collectionName}_config.js`);
  config.sqlite_file_name = `${req.params.collectionName}.sqlite`;
  let databasePath = appRoot + "/config/" + config.sqlite_file_name;
  // if (!fs.existsSync(databasePath)) {
  //   rarity_analyze();
  //   rarity_analyze_normalized();
  // }
  const db = new Database(databasePath);

  let search = req.query.search;
  let traits = req.query.traits;
  let useTraitNormalization = req.query.trait_normalization;
  let orderBy = req.query.order_by;
  let page = req.query.page;

  let offset = 0;
  let limit = config.page_item_num;

  if (_.isEmpty(search)) {
    search = "";
  }

  if (_.isEmpty(traits)) {
    traits = "";
  }

  let scoreTable = `${req.params.collectionName}_scores`;
  if (useTraitNormalization == "1") {
    useTraitNormalization = "1";
    scoreTable = `normalized_${req.params.collectionName}_scores`;
  } else {
    useTraitNormalization = "0";
  }

  if (orderBy == "rarity" || orderBy == "id") {
    orderBy = orderBy;
  } else {
    orderBy = "rarity";
  }

  if (!_.isEmpty(page)) {
    page = parseInt(page);
    if (!isNaN(page)) {
      offset = (Math.abs(page) - 1) * limit;
    } else {
      page = 1;
    }
  } else {
    page = 1;
  }

  let selectedTraits = traits != "" ? traits.split(",") : [];
  let totalPunkCount = 0;
  let punks = null;
  let orderByStmt = "";
  if (orderBy == "rarity") {
    orderByStmt = "ORDER BY " + scoreTable + ".rarity_rank ASC";
  } else {
    orderByStmt = `ORDER BY ${req.params.collectionName}s.id ASC`;
  }

  let totalSupply = db
    .prepare(
      `SELECT COUNT(${req.params.collectionName}s.id) as ${req.params.collectionName}_total FROM ${req.params.collectionName}s`
    )
    .get();
  console.log(totalSupply, "totalSupply");
  totalSupply = [...Object.values(totalSupply)][0];

  let allTraitTypes = db.prepare("SELECT trait_types.* FROM trait_types").all();
  let allTraitTypesData = {};
  let i = 2;
  allTraitTypes.forEach((traitType) => {
    if (i == 2) {
      console.log();
      i += 1;
    }
    allTraitTypesData[traitType.trait_type] = [...Object.values(traitType)][3]; //traitType.punk_count
  });

  let allTraits = db
    .prepare(
      `SELECT trait_types.trait_type, trait_detail_types.trait_detail_type, trait_detail_types.${req.params.collectionName}_count, trait_detail_types.trait_type_id, trait_detail_types.id trait_detail_type_id  FROM trait_detail_types INNER JOIN trait_types ON (trait_detail_types.trait_type_id = trait_types.id) WHERE trait_detail_types.${req.params.collectionName}_count != 0 ORDER BY trait_types.trait_type, trait_detail_types.trait_detail_type`
    )
    .all();
  let totalPunkCountQuery =
    `SELECT COUNT(${req.params.collectionName}s.id) as ${req.params.collectionName}_total FROM ${req.params.collectionName}s INNER JOIN ` +
    scoreTable +
    ` ON (${req.params.collectionName}s.id = ` +
    scoreTable +
    `.${req.params.collectionName}_id) `;
  let punksQuery =
    `SELECT ${req.params.collectionName}s.*, ` +
    scoreTable +
    `.rarity_rank FROM ${req.params.collectionName}s INNER JOIN ` +
    scoreTable +
    ` ON (${req.params.collectionName}s.id = ` +
    scoreTable +
    `.${req.params.collectionName}_id) `;
  let totalPunkCountQueryValue = {};
  let punksQueryValue = {};

  if (!_.isEmpty(search)) {
    search = parseInt(search);
    totalPunkCountQuery =
      totalPunkCountQuery +
      ` WHERE ${req.params.collectionName}s.id LIKE :${req.params.collectionName}_id `;
    totalPunkCountQueryValue[`${req.params.collectionName}_id`] =
      "%" + search + "%";

    punksQuery =
      punksQuery +
      ` WHERE ${req.params.collectionName}s.id LIKE :${req.params.collectionName}_id `;
    punksQueryValue[`${req.params.collectionName}_id`] = "%" + search + "%";
  } else {
    totalPunkCount = totalPunkCount;
  }

  let allTraitTypeIds = [];
  allTraits.forEach((trait) => {
    if (!allTraitTypeIds.includes(trait.trait_type_id.toString())) {
      allTraitTypeIds.push(trait.trait_type_id.toString());
    }
  });

  let purifySelectedTraits = [];
  if (selectedTraits.length > 0) {
    selectedTraits.map((selectedTrait) => {
      selectedTrait = selectedTrait.split("_");
      if (allTraitTypeIds.includes(selectedTrait[0])) {
        purifySelectedTraits.push(selectedTrait[0] + "_" + selectedTrait[1]);
      }
    });

    if (purifySelectedTraits.length > 0) {
      if (!_.isEmpty(search.toString())) {
        totalPunkCountQuery = totalPunkCountQuery + " AND ";
        punksQuery = punksQuery + " AND ";
      } else {
        totalPunkCountQuery = totalPunkCountQuery + " WHERE ";
        punksQuery = punksQuery + " WHERE ";
      }
      let count = 0;

      purifySelectedTraits.forEach((selectedTrait) => {
        selectedTrait = selectedTrait.split("_");
        totalPunkCountQuery =
          totalPunkCountQuery +
          " " +
          scoreTable +
          ".trait_type_" +
          selectedTrait[0] +
          "_value = :trait_type_" +
          selectedTrait[0] +
          "_value ";
        punksQuery =
          punksQuery +
          " " +
          scoreTable +
          ".trait_type_" +
          selectedTrait[0] +
          "_value = :trait_type_" +
          selectedTrait[0] +
          "_value ";
        if (count != purifySelectedTraits.length - 1) {
          totalPunkCountQuery = totalPunkCountQuery + " AND ";
          punksQuery = punksQuery + " AND ";
        }
        count++;

        totalPunkCountQueryValue["trait_type_" + selectedTrait[0] + "_value"] =
          selectedTrait[1];
        punksQueryValue["trait_type_" + selectedTrait[0] + "_value"] =
          selectedTrait[1];
      });
    }
  }
  let purifyTraits = purifySelectedTraits.join(",");

  punksQuery = punksQuery + " " + orderByStmt + " LIMIT :offset,:limit";
  punksQueryValue["offset"] = offset;
  punksQueryValue["limit"] = limit;

  console.log(punksQueryValue, "punksQueryValue");

  totalPunkCount = db
    .prepare(totalPunkCountQuery)
    .get(totalPunkCountQueryValue);

  console.log(totalPunkCount, "fjenfkfwebhj");

  totalPunkCount = [...Object.values(totalPunkCount)][0];
  punks = db.prepare(punksQuery).all(punksQueryValue);
  let totalPage = Math.ceil(totalPunkCount / limit);

  res.status(200).json({
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + " | " + config.app_name,
    ogDescription:
      config.collection_description + " | " + config.app_description,
    ogUrl:
      req.protocol + "://" + req.get("host") + "/" + req.params.collectionName, //ogUrl: req.protocol + "://" + req.get("host") + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: "rarity",
    punks: punks,
    totalPunkCount: totalPunkCount,
    totalPage: totalPage,
    search: search,
    useTraitNormalization: useTraitNormalization,
    orderBy: orderBy,
    traits: purifyTraits,
    selectedTraits: purifySelectedTraits,
    allTraits: allTraits,
    page: page,
    totalSupply: totalSupply,
    allTraitTypesData: allTraitTypesData,
    item_path_name: config.item_path_name,
    collection_name: config.collection_name,
    _: _,
  });
});

router.get("/:collectionName/matrix", function (req, res, next) {
  const config = require(appRoot +
    `/config/${req.params.collectionName}_config.js`);
  config.sqlite_file_name = `${req.params.collectionName}.sqlite`;
  let databasePath = appRoot + "/config/" + config.sqlite_file_name;
  if (!fs.existsSync(databasePath)) {
    res.redirect("/:collectionName");
  }
  const db = new Database(databasePath);

  let allTraits = db
    .prepare(
      `SELECT trait_types.trait_type, trait_detail_types.trait_detail_type, trait_detail_types.${req.params.collectionName}_count FROM trait_detail_types INNER JOIN trait_types ON (trait_detail_types.trait_type_id = trait_types.id) WHERE trait_detail_types.${req.params.collectionName}_count != 0 ORDER BY trait_types.trait_type, trait_detail_types.trait_detail_type`
    )
    .all();
  let allTraitCounts = db
    .prepare(
      `SELECT * FROM ${req.params.collectionName}_trait_counts WHERE ${req.params.collectionName}_count != 0 ORDER BY trait_count`
    )
    .all();
  let totalPunkCount = db
    .prepare(
      `SELECT COUNT(id) as ${req.params.collectionName}_total FROM ${req.params.collectionName}s`
    )
    .get();
  totalPunkCount = [...Object.values(totalPunkCount)][0];

  res.status(200).json({
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + " | " + config.app_name,
    ogDescription:
      config.collection_description + " | " + config.app_description,
    ogUrl:
      req.protocol +
      "://" +
      req.get("host") +
      req.originalUrl.replace("/matrix", ""), //ogUrl: req.protocol + "://" + req.get("host") + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: "matrix",
    allTraits: allTraits,
    allTraitCounts: allTraitCounts,
    totalPunkCount: totalPunkCount,
    _: _,
  });
});

router.get("/wallet", function (req, res, next) {
  let search = req.query.search;
  let useTraitNormalization = req.query.trait_normalization;

  if (_.isEmpty(search)) {
    search = "";
  }

  let scoreTable = "punk_scores";
  if (useTraitNormalization == "1") {
    useTraitNormalization = "1";
    scoreTable = "normalized_punk_scores";
  } else {
    useTraitNormalization = "0";
  }

  let isAddress = Web3.utils.isAddress(search);
  let tokenIds = [];
  let punks = null;
  if (isAddress) {
    let url = "https://api.punkscape.xyz/address/" + search + "/punkscapes";
    let result = request("GET", url);
    let data = result.getBody("utf8");
    data = JSON.parse(data);
    data.forEach((element) => {
      tokenIds.push(element.token_id);
    });
    if (tokenIds.length > 0) {
      let punksQuery =
        "SELECT punks.*, " +
        scoreTable +
        ".rarity_rank FROM punks INNER JOIN " +
        scoreTable +
        " ON (punks.id = " +
        scoreTable +
        ".punk_id) WHERE punks.id IN (" +
        tokenIds.join(",") +
        ") ORDER BY " +
        scoreTable +
        ".rarity_rank ASC";
      punks = db.prepare(punksQuery).all();
    }
  }

  res.status(200).json({
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + " | " + config.app_name,
    ogDescription:
      config.collection_description + " | " + config.app_description,
    ogUrl: req.protocol + "://" + req.get("host") + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: "wallet",
    punks: punks,
    search: search,
    useTraitNormalization: useTraitNormalization,
    _: _,
  });
});

router.get("/", (req, res, next) => {
  let files = fs.readdirSync(`${__dirname}/../config`);
  files = files
    .filter((el) => el.slice(-6) === "sqlite")
    .map((el) => el.slice(0, -7));
  let collection = [];
  files.forEach((file) => {
    collection.push({ name: file, content: "NO content", link: `/${file}` });
  });
  res.status(200).json({ collections: collection });
});

router.post("/add", (req, res) => {
  let form = new formidable.IncomingForm();
  form.keepExtensions = true;
  form.parse(req, (err, fields, files) => {
    if (err) res.json({ err });
    var oldPath = files.collection.filepath;
    var newPath = `${__dirname}/../config/${files.collection.originalFilename}`;
    var rawData = fs.readFileSync(oldPath);
    fs.writeFileSync(newPath, rawData);
    oldPath = files.config.filepath;
    newPath = `${__dirname}/../config/${files.config.originalFilename}`;
    rawData = fs.readFileSync(oldPath);
    fs.writeFileSync(newPath, rawData);
    console.log(newPath, "yahan aaya");

    rarity_analyze(files.config.originalFilename);
    rarity_analyze_normalized(files.config.originalFilename);
  });
  res.json({});
});

module.exports = router;
