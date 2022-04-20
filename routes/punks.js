const appRoot = require("app-root-path");
// var config = require(appRoot + '/config/config.js');
const express = require("express");
const router = express.Router();
const fs = require("fs");
const Database = require("better-sqlite3");
const jsondata = require(appRoot + "/modules/jsondata.js");
const _ = require("lodash");
const MarkdownIt = require("markdown-it"),
  md = new MarkdownIt();

/* GET punks listing. */
router.get("/:id", function (req, res, next) {
  const collection = req.originalUrl
    .split("?")[0]
    .replace(`/${req.params.id}`, "")
    .slice(5);
  let punkId = req.params.id;
  const config = require(appRoot + `/config/${collection}_config.js`);
  // config = config1;
  let useTraitNormalization = req?.query?.trait_normalization;
  let databasePath = appRoot + "/config/" + config.sqlite_file_name;
  console.log(databasePath);

  const db = new Database(databasePath);

  let scoreTable = `${collection}_scores`;
  if (useTraitNormalization == "1") {
    useTraitNormalization = "1";
    scoreTable = `normalized_${collection}_scores`;
  } else {
    useTraitNormalization = "0";
  }

  let punk = db
    .prepare(
      `SELECT ${collection}s.*, ` +
        scoreTable +
        `.rarity_rank FROM ${collection}s INNER JOIN ` +
        scoreTable +
        ` ON (${collection}s.id = ` +
        scoreTable +
        `.${collection}_id) WHERE ${collection}s.id = ?`
    )
    .get(punkId);
  let punkScore = db
    .prepare(
      "SELECT " +
        scoreTable +
        ".* FROM " +
        scoreTable +
        " WHERE " +
        scoreTable +
        `.${collection}_id = ?`
    )
    .get(punkId);
  let allTraitTypes = db.prepare("SELECT trait_types.* FROM trait_types").all();
  let allDetailTraitTypes = db
    .prepare("SELECT trait_detail_types.* FROM trait_detail_types")
    .all();
  let allTraitCountTypes = db
    .prepare(
      `SELECT ${collection}_trait_counts.* FROM ${collection}_trait_counts`
    )
    .all();

  let punkTraits = db
    .prepare(
      `SELECT ${collection}_traits.*, trait_types.trait_type  FROM ${collection}_traits INNER JOIN trait_types ON (${collection}_traits.trait_type_id = trait_types.id) WHERE ${collection}_traits.${collection}_id = ?`
    )
    .all(punkId);
  let totalPunkCount = db
    .prepare(`SELECT COUNT(id) as ${collection}_total FROM ${collection}s`)
    .get().punk_total;

  let punkTraitData = {};
  let ignoredPunkTraitData = {};
  let ignoreTraits = config.ignore_traits.map((ignore_trait) =>
    ignore_trait.toLowerCase()
  );
  punkTraits.forEach((punkTrait) => {
    punkTraitData[punkTrait.trait_type_id] = punkTrait.value;

    if (!ignoreTraits.includes(punkTrait.trait_type.toLowerCase())) {
      ignoredPunkTraitData[punkTrait.trait_type_id] = punkTrait.value;
    }
  });

  let allDetailTraitTypesData = {};
  allDetailTraitTypes.forEach((detailTrait) => {
    allDetailTraitTypesData[
      detailTrait.trait_type_id + "|||" + detailTrait.trait_detail_type
    ] = detailTrait.punk_count;
  });

  let allTraitCountTypesData = {};
  allTraitCountTypes.forEach((traitCount) => {
    allTraitCountTypesData[traitCount.trait_count] = traitCount.punk_count;
  });

  let title = config.collection_name + " | " + config.app_name;
  //let description = config.collection_description + ' | ' + config.app_description
  let description = punk
    ? `💎 ID: ${punk.id}
    💎 Rarity Rank: ${punk.rarity_rank}
    💎 Rarity Score: ${punkScore.rarity_sum.toFixed(2)}`
    : "";

  if (!_.isEmpty(punk)) {
    title = punk.name + " | " + config.app_name;
  }

  res.status(200).json({
    appTitle: title,
    appDescription: description,
    ogTitle: title,
    ogDescription: description,
    ogUrl: req.protocol + "://" + req.get("host") + "/" + collection,
    ogImage: punk
      ? punk.image.replace("ipfs://", "https://ipfs.io/ipfs/")
      : config.main_og_image,
    activeTab: "rarity",
    punk: punk,
    punkScore: punkScore,
    allTraitTypes: allTraitTypes,
    allDetailTraitTypesData: allDetailTraitTypesData,
    allTraitCountTypesData: allTraitCountTypesData,
    punkTraitData: punkTraitData,
    ignoredPunkTraitData: ignoredPunkTraitData,
    totalPunkCount: totalPunkCount,
    item_path_name: config.item_path_name,
    trait_normalization: useTraitNormalization,
    _: _,
    md: md,
  });
});

router.get("/:id/json", function (req, res, next) {
  const collection = req.originalUrl
    .replace(`/${req.params.id}/json`, "")
    .slice(5);
  const config = require(appRoot + `/config/${collection}_config.js`);
  let databasePath = appRoot + "/config/" + config.sqlite_file_name;
  const db = new Database(databasePath);

  let punkId = req.params.id;
  let useTraitNormalization = req.query.trait_normalization;

  let scoreTable = `${collection}_scores`;
  if (useTraitNormalization == "1") {
    useTraitNormalization = "1";
    scoreTable = `normalized_${collection}_scores`;
  } else {
    useTraitNormalization = "0";
  }

  let punk = db
    .prepare(
      `SELECT ${collection}s.*, ` +
        scoreTable +
        `.rarity_rank FROM ${collection}s INNER JOIN ` +
        scoreTable +
        ` ON (${collection}s.id = ` +
        scoreTable +
        `.${collection}_id) WHERE ${collection}s.id = ?`
    )
    .get(punkId);
  console.log(punk);

  if (_.isEmpty(punk)) {
    res.end(
      JSON.stringify({
        status: "fail",
        message: "not_exist",
      })
    );
  }

  let punkData = jsondata.punk(punk, scoreTable, collection);

  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      status: "success",
      message: "success",
      punk: punkData,
    })
  );
});

router.get("/:id/similar", function (req, res, next) {
  const collection = req.originalUrl
    .replace(`/${req.params.id}/similar`, "")
    .slice(5);
  const config = require(appRoot + `/config/${collection}_config.js`);
  let databasePath = appRoot + "/config/" + config.sqlite_file_name;
  const db = new Database(databasePath);
  let punkId = req.params.id;
  let useTraitNormalization = req.query.trait_normalization;

  let scoreTable = `${collection}_scores`;
  if (useTraitNormalization == "1") {
    useTraitNormalization = "1";
    scoreTable = `normalized_${collection}_scores`;
  } else {
    useTraitNormalization = "0";
  }

  let punk = db
    .prepare(
      `SELECT ${collection}s.*, ` +
        scoreTable +
        `.rarity_rank FROM ${collection}s INNER JOIN ` +
        scoreTable +
        ` ON (${collection}s.id = ` +
        scoreTable +
        `.${collection}_id) WHERE ${collection}s.id = ?`
    )
    .get(punkId);
  let punkScore = db
    .prepare(
      "SELECT " +
        scoreTable +
        ".* FROM " +
        scoreTable +
        " WHERE " +
        scoreTable +
        `.${collection}_id = ?`
    )
    .get(punkId);
  let allTraitTypes = db.prepare("SELECT trait_types.* FROM trait_types").all();
  let similarCondition = "";
  let similarTo = {};
  let similarPunks = null;
  if (punkScore) {
    allTraitTypes.forEach((traitType) => {
      similarCondition =
        similarCondition +
        "IIF(" +
        scoreTable +
        ".trait_type_" +
        traitType.id +
        "_value = :trait_type_" +
        traitType.id +
        ", 1 * " +
        scoreTable +
        ".trait_type_" +
        traitType.id +
        "_rarity, 0) + ";
      similarTo["trait_type_" + traitType.id] =
        punkScore["trait_type_" + traitType.id + "_value"];
    });
    similarTo["trait_count"] = punkScore["trait_count"];
    similarTo[`this_${collection}_id`] = punkId;
    similarPunks = db
      .prepare(
        `
      SELECT
        ${collection}s.*,
        ` +
          scoreTable +
          `.${collection}_id, 
        (
          ` +
          similarCondition +
          `
          IIF(` +
          scoreTable +
          `.trait_count = :trait_count, 1 * 0, 0)
        )
        similar 
      FROM ` +
          scoreTable +
          `  
      INNER JOIN ${collection}s ON (` +
          scoreTable +
          `.${collection}_id = ${collection}s.id)
      WHERE ` +
          scoreTable +
          `.${collection}_id != :this_${collection}_id
      ORDER BY similar desc
      LIMIT 12
      `
      )
      .all(similarTo);
  }

  let title = config.collection_name + " | " + config.app_name;
  let description =
    config.collection_description + " | " + config.app_description;
  if (!_.isEmpty(punk)) {
    title = punk.name + " | " + config.app_name;
  }

  res.status(200).json({
    appTitle: title,
    appDescription: description,
    ogTitle: title,
    ogDescription: description,
    ogUrl: req.protocol + "://" + req.get("host") + "/" + collection,
    ogImage: punk
      ? punk.image.replace("ipfs://", "https://ipfs.io/ipfs/")
      : config.main_og_image,
    activeTab: "rarity",
    punk: punk,
    similarPunks: similarPunks,
    trait_normalization: useTraitNormalization,
    item_path_name: config.item_path_name,
    _: _,
  });
});

module.exports = router;
