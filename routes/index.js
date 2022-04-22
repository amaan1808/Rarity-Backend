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

  let collectionDetails;
  try {
    collectionDetails = db
      .prepare(`SELECT * FROM ${req.params.collectionName}_details`)
      .all();
  } catch (err) {}

  let search = req.query.search;
  let traits = decodeURIComponent(req.query.traits);
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
  let totalCollectionItemCount = 0;
  let collectionItems = null;
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
  let totalCollectionItemCountQuery =
    `SELECT COUNT(${req.params.collectionName}s.id) as ${req.params.collectionName}_total FROM ${req.params.collectionName}s INNER JOIN ` +
    scoreTable +
    ` ON (${req.params.collectionName}s.id = ` +
    scoreTable +
    `.${req.params.collectionName}_id) `;
  let collectionItemsQuery =
    `SELECT ${req.params.collectionName}s.*, ` +
    scoreTable +
    `.rarity_rank FROM ${req.params.collectionName}s INNER JOIN ` +
    scoreTable +
    ` ON (${req.params.collectionName}s.id = ` +
    scoreTable +
    `.${req.params.collectionName}_id) `;
  let totalCollectionItemCountQueryValue = {};
  let collectionItemsQueryValue = {};

  if (!_.isEmpty(search)) {
    search = parseInt(search);
    totalCollectionItemCountQuery =
      totalCollectionItemCountQuery +
      ` WHERE ${req.params.collectionName}s.id LIKE :${req.params.collectionName}_id `;
    totalCollectionItemCountQueryValue[`${req.params.collectionName}_id`] =
      "%" + search + "%";

    collectionItemsQuery =
      collectionItemsQuery +
      ` WHERE ${req.params.collectionName}s.id LIKE :${req.params.collectionName}_id `;
    collectionItemsQueryValue[`${req.params.collectionName}_id`] = "%" + search + "%";
  } else {
    totalCollectionItemCount = totalCollectionItemCount;
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
        totalCollectionItemCountQuery = totalCollectionItemCountQuery + " AND ";
        collectionItemsQuery = collectionItemsQuery + " AND ";
      } else {
        totalCollectionItemCountQuery = totalCollectionItemCountQuery + " WHERE ";
        collectionItemsQuery = collectionItemsQuery + " WHERE ";
      }
      let count = 0;

      purifySelectedTraits.forEach((selectedTrait) => {
        selectedTrait = selectedTrait.split("_");
        totalCollectionItemCountQuery =
          totalCollectionItemCountQuery +
          " " +
          scoreTable +
          ".trait_type_" +
          selectedTrait[0] +
          "_value = :trait_type_" +
          selectedTrait[0] +
          "_value ";
        collectionItemsQuery =
          collectionItemsQuery +
          " " +
          scoreTable +
          ".trait_type_" +
          selectedTrait[0] +
          "_value = :trait_type_" +
          selectedTrait[0] +
          "_value ";
        if (count != purifySelectedTraits.length - 1) {
          totalCollectionItemCountQuery = totalCollectionItemCountQuery + " AND ";
          collectionItemsQuery = collectionItemsQuery + " AND ";
        }
        count++;

        totalCollectionItemCountQueryValue["trait_type_" + selectedTrait[0] + "_value"] =
          selectedTrait[1];
        collectionItemsQueryValue["trait_type_" + selectedTrait[0] + "_value"] =
          selectedTrait[1];
      });
    }
  }
  let purifyTraits = purifySelectedTraits.join(",");

  collectionItemsQuery = collectionItemsQuery + " " + orderByStmt + " LIMIT :offset,:limit";
  collectionItemsQueryValue["offset"] = offset;
  collectionItemsQueryValue["limit"] = limit;

  totalCollectionItemCount = db
    .prepare(totalCollectionItemCountQuery)
    .get(totalCollectionItemCountQueryValue);

  totalCollectionItemCount = [...Object.values(totalCollectionItemCount)][0];
  collectionItems = db.prepare(collectionItemsQuery).all(collectionItemsQueryValue);
  let totalPage = Math.ceil(totalCollectionItemCount / limit);

  res.status(200).json({
    appTitle: config.app_name,
    appDescription: config.app_description,
    details: collectionDetails?.length
      ? collectionDetails[0]
      : {
          discord: "",
          twitter: "",
          collection_image: "",
          website: "",
        },
    ogTitle: config.collection_name + " | " + config.app_name,
    ogDescription:
      config.collection_description + " | " + config.app_description,
    ogUrl:
      req.protocol + "://" + req.get("host") + "/" + req.params.collectionName, //ogUrl: req.protocol + "://" + req.get("host") + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: "rarity",
    collectionItems: collectionItems,
    totalCollectionItemCount: totalCollectionItemCount,
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
  let totalCollectionItemCount = db
    .prepare(
      `SELECT COUNT(id) as ${req.params.collectionName}_total FROM ${req.params.collectionName}s`
    )
    .get();
  totalCollectionItemCount = [...Object.values(totalCollectionItemCount)][0];

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
    totalCollectionItemCount: totalCollectionItemCount,
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
  let collectionItems = null;
  if (isAddress) {
    let url = "https://api.punkscape.xyz/address/" + search + "/punkscapes";
    let result = request("GET", url);
    let data = result.getBody("utf8");
    data = JSON.parse(data);
    data.forEach((element) => {
      tokenIds.push(element.token_id);
    });
    if (tokenIds.length > 0) {
      let collectionItemsQuery =
        "SELECT collection_items.*, " +
        scoreTable +
        ".rarity_rank FROM collection_items INNER JOIN " +
        scoreTable +
        " ON (collection_items.id = " +
        scoreTable +
        ".punk_id) WHERE collection_items.id IN (" +
        tokenIds.join(",") +
        ") ORDER BY " +
        scoreTable +
        ".rarity_rank ASC";
      collectionItems = db.prepare(collectionItemsQuery).all();
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
    collectionItems: collectionItems,
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
    let databasePath = appRoot + "/config/" + file + ".sqlite";

    const db = new Database(databasePath);
    let collectionDetails;
    try {
      collectionDetails = db.prepare(`SELECT * FROM ${file}_details`).all();
    } catch (err) {}

    const body = {
      name: file,
      content: "NO content",
      link: `/${file}`,
    };

    if (collectionDetails?.length) {
      body.details = collectionDetails[0];
    }

    console.log(file, "file");
    const config = require(appRoot + `/config/${file}_config.js`);

    body.name = config.collection_name;

    collection.push(body);
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
