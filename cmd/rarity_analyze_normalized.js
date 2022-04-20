const appRoot = require("app-root-path");
// const config = require(appRoot + "/config/config.js");
const fs = require("fs");
const Database = require("better-sqlite3");
const argv = require("minimist")(process.argv.slice(2), {
  string: ["mode"],
});

let mode = argv["mode"];

exports.rarity_analyze_normalized = (configFile) => {
  const config = require(appRoot + `/config/${configFile}`);
  const collectionData = require(appRoot +
    "/config/" +
    config.collection_file_name);
  let collection = config.sqlite_file_name.slice(0, -7);

  let ignoreTraits = config.ignore_traits.map((ignore_trait) =>
    ignore_trait.toLowerCase()
  );

  const databasePath = appRoot + "/config/" + config.sqlite_file_name;

  if (!fs.existsSync(databasePath)) {
    console.log("Database not exist.");
    return;
  }

  const db = new Database(databasePath);

  if (mode != "force") {
    let checkTable = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='normalized_${collection}_scores'`
      )
      .get();
    if (checkTable) {
      if (checkTable.name == `normalized_${collection}_scores`) {
        console.log("Database exist.");
        return;
      }
    }
  }

  let allTraitTypes = db.prepare("SELECT trait_types.* FROM trait_types").all();
  let allTraitTypeCount = db
    .prepare(
      `SELECT trait_type_id, COUNT(trait_type_id) as trait_type_count, SUM(${collection}_count) trait_type_sum FROM trait_detail_types GROUP BY trait_type_id`
    )
    .all();
  let traitCountNum = db
    .prepare(
      `SELECT COUNT(*) as trait_count_num FROM ${collection}_trait_counts`
    )
    .get().trait_count_num;
  let traitCounts = db
    .prepare(`SELECT * FROM ${collection}_trait_counts`)
    .all();
  let totalSupply = db
    .prepare(
      `SELECT COUNT(${collection}s.id) as ${collection}_total FROM ${collection}s`
    )
    .get()[`${collection}_total`];
  let allTraits = db
    .prepare(
      `SELECT trait_types.trait_type, trait_detail_types.trait_detail_type, trait_detail_types.${collection}_count, trait_detail_types.trait_type_id, trait_detail_types.id trait_detail_type_id  FROM trait_detail_types INNER JOIN trait_types ON (trait_detail_types.trait_type_id = trait_types.id) ORDER BY trait_types.trait_type, trait_detail_types.trait_detail_type`
    )
    .all();

  let traitTypeCountSum = 0 + traitCountNum;
  let traitTypeNum = 0 + 1;
  let missingTraitTypeId = [];
  let traitTypeRarityScoreSum = [];
  let traitTypeCountNum = [];
  let traitTypeValueCount = [];
  allTraitTypeCount.forEach((traitTypeCount) => {
    let thisTraitType = db
      .prepare("SELECT trait_types.* FROM trait_types WHERE id = ?")
      .get(traitTypeCount.trait_type_id);
    if (ignoreTraits.includes(thisTraitType.trait_type.toLowerCase())) {
      traitTypeRarityScoreSum[traitTypeCount.trait_type_id] = 0;
      traitTypeCountNum[traitTypeCount.trait_type_id] = 0;
      traitTypeValueCount[traitTypeCount.trait_type_id] = 0;
    } else {
      let hasMissingTrait =
        traitTypeCount.trait_type_sum != totalSupply ? 1 : 0;
      if (hasMissingTrait) {
        missingTraitTypeId.push(traitTypeCount.trait_type_id);
        traitTypeRarityScoreSum[traitTypeCount.trait_type_id] =
          totalSupply / (totalSupply - traitTypeCount.trait_type_sum);
      } else {
        traitTypeRarityScoreSum[traitTypeCount.trait_type_id] = 0;
      }
      traitTypeCountNum[traitTypeCount.trait_type_id] =
        traitTypeCount.trait_type_count + hasMissingTrait;
      traitTypeCountSum =
        traitTypeCountSum + (traitTypeCount.trait_type_count + hasMissingTrait);
      traitTypeNum = traitTypeNum + 1;

      traitTypeValueCount[traitTypeCount.trait_type_id] =
        traitTypeCount.trait_type_count + hasMissingTrait;
    }
  });
  traitTypeValueCount[allTraitTypes.length] = traitCountNum;
  let meanValueCount = traitTypeCountSum / traitTypeNum;

  allTraits.forEach((detailTrait) => {
    traitTypeRarityScoreSum[detailTrait.trait_type_id] =
      traitTypeRarityScoreSum[detailTrait.trait_type_id] +
      totalSupply / detailTrait[`${collection}_count`];
  });
  traitTypeRarityScoreSum[allTraitTypes.length] = 0;
  traitCounts.forEach((traitCount) => {
    traitTypeRarityScoreSum[allTraitTypes.length] =
      traitTypeRarityScoreSum[allTraitTypes.length] +
      totalSupply / traitCount[`${collection}_count`];
  });

  let traitTypeMeanRarity = [];
  allTraitTypes.forEach((traitType) => {
    if (ignoreTraits.includes(traitType.trait_type.toLowerCase())) {
      traitTypeMeanRarity[traitType.id] = 0;
    } else {
      traitTypeMeanRarity[traitType.id] =
        traitTypeRarityScoreSum[traitType.id] / traitTypeCountNum[traitType.id];
    }
  });

  traitTypeMeanRarity[allTraitTypes.length] =
    traitTypeRarityScoreSum[allTraitTypes.length] / traitCountNum;
  let meanRarity =
    traitTypeMeanRarity.reduce((a, b) => a + b, 0) / traitTypeMeanRarity.length;

  let createScoreTableStmt = `CREATE TABLE normalized_${collection}_scores ( id INT, ${collection}_id INT, `;
  let insertCollectionItemScoreStmt = `INSERT INTO normalized_${collection}_scores VALUES (:id, :${collection}_id, `;

  allTraitTypes.forEach((traitType) => {
    createScoreTableStmt =
      createScoreTableStmt +
      "trait_type_" +
      traitType.id +
      "_percentile DOUBLE, trait_type_" +
      traitType.id +
      "_rarity DOUBLE, trait_type_" +
      traitType.id +
      "_value TEXT, ";
    insertCollectionItemScoreStmt =
      insertCollectionItemScoreStmt +
      ":trait_type_" +
      traitType.id +
      "_percentile, :trait_type_" +
      traitType.id +
      "_rarity, :trait_type_" +
      traitType.id +
      "_value, ";
  });

  createScoreTableStmt =
    createScoreTableStmt +
    "trait_count INT,  trait_count_percentile DOUBLE, trait_count_rarity DOUBLE, rarity_sum DOUBLE, rarity_rank INT)";
  insertCollectionItemScoreStmt =
    insertCollectionItemScoreStmt +
    ":trait_count,  :trait_count_percentile, :trait_count_rarity, :rarity_sum, :rarity_rank)";

  db.exec(createScoreTableStmt);
  insertCollectionItemScoreStmt = db.prepare(insertCollectionItemScoreStmt);

  let collectionItemScores = db.prepare(`SELECT * FROM ${collection}_scores`).all();

  collectionItemScores.forEach((collectionItemScore) => {
    console.log(`Normalize ${collection}: #` + collectionItemScore.id);

    let raritySum = 0;
    let normalizedCollectionItemScore = {};
    normalizedCollectionItemScore["id"] = collectionItemScore.id;
    normalizedCollectionItemScore[`${collection}_id`] = collectionItemScore[`${collection}_id`];

    for (let i = 0; i < traitTypeMeanRarity.length; i++) {
      let a = 0;
      if (traitTypeMeanRarity[i] >= meanRarity) {
        a = (traitTypeMeanRarity[i] - meanRarity) / traitTypeMeanRarity[i];
      } else {
        a = (meanRarity - traitTypeMeanRarity[i]) / meanRarity;
      }

      let b = 0;
      if (traitTypeValueCount[i] >= meanValueCount) {
        b = (traitTypeValueCount[i] - meanValueCount) / traitTypeValueCount[i];
      } else {
        b = (meanValueCount - traitTypeValueCount[i]) / meanValueCount;
      }

      let c = traitTypeValueCount[i] >= meanValueCount ? 1 - b : 1 + b;
      let r =
        i == traitTypeMeanRarity.length - 1
          ? collectionItemScore["trait_count_rarity"]
          : collectionItemScore["trait_type_" + i + "_rarity"];
      let rarity_score_normalized = 0;

      if (
        a >= b &&
        ((traitTypeMeanRarity[i] > meanRarity &&
          traitTypeValueCount[i] > meanValueCount) ||
          (traitTypeMeanRarity[i] < meanRarity &&
            traitTypeValueCount[i] < meanValueCount))
      ) {
        rarity_score_normalized = (r - (a - b) * r) * c + (a - b) * r;
      } else {
        rarity_score_normalized = (r - a * r) * c + a * r;
      }

      if (i == traitTypeMeanRarity.length - 1) {
        normalizedCollectionItemScore["trait_count"] = collectionItemScore["trait_count"];
        normalizedCollectionItemScore["trait_count_percentile"] =
          collectionItemScore["trait_count_percentile"];
        normalizedCollectionItemScore["trait_count_rarity"] = rarity_score_normalized;
        raritySum = raritySum + rarity_score_normalized;
        normalizedCollectionItemScore["rarity_sum"] = raritySum;
        normalizedCollectionItemScore["rarity_rank"] = 0;
      } else {
        if (
          !ignoreTraits.includes(
            collectionItemScore["trait_type_" + i + "_value"].toLowerCase()
          )
        ) {
          normalizedCollectionItemScore["trait_type_" + i + "_percentile"] =
            collectionItemScore["trait_type_" + i + "_percentile"];
          normalizedCollectionItemScore["trait_type_" + i + "_rarity"] =
            rarity_score_normalized;
          raritySum = raritySum + rarity_score_normalized;
        } else {
          normalizedCollectionItemScore["trait_type_" + i + "_percentile"] = 0;
          normalizedCollectionItemScore["trait_type_" + i + "_rarity"] = 0;
          raritySum = raritySum + 0;
        }
        normalizedCollectionItemScore["trait_type_" + i + "_value"] =
          collectionItemScore["trait_type_" + i + "_value"];
      }
    }

    // console.log(normalizedCollectionItemScore);

    insertCollectionItemScoreStmt.run(normalizedCollectionItemScore);
  });

  const collectionItemScoreStmt = db.prepare(
    `SELECT rarity_sum FROM normalized_${collection}_scores WHERE ${collection}_id = ?`
  );
  const collectionItemRankStmt = db.prepare(
    `SELECT COUNT(id) as higherRank FROM normalized_${collection}_scores WHERE rarity_sum > ?`
  );
  let updatCollectionItemRankStmt = db.prepare(
    `UPDATE normalized_${collection}_scores SET rarity_rank = :rarity_rank WHERE ${collection}_id = :${collection}_id`
  );

  collectionItemScores.forEach((collectionItemScore) => {
    console.log(
      `Normalized ranking ${collection}: #` + collectionItemScore[`${collection}_id`]
    );
    let normalizedCollectionItemScore = collectionItemScoreStmt.get(collectionItemScore[`${collection}_id`]);
    let collectionItemRank = collectionItemRankStmt.get(normalizedCollectionItemScore.rarity_sum);
    updatCollectionItemRankStmt.run({
      rarity_rank: collectionItemRank.higherRank + 1,
      [`${collection}_id`]: collectionItemScore[`${collection}_id`],
    });
  });
};
