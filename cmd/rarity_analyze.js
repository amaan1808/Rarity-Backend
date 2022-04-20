const appRoot = require("app-root-path");
// const config = require(appRoot + '/config/config.js');
// const collectionData = require(appRoot + '/config/' + config.collection_file_name);
const fs = require("fs");
const Database = require("better-sqlite3");
const _ = require("lodash");
const argv = require("minimist")(process.argv.slice(2), {
  string: ["mode"],
});

let mode = argv["mode"];
exports.rarity_analyze = (configFile) => {
  const config = require(appRoot + `/config/${configFile}`);
  const collectionData = require(appRoot +
    "/config/" +
    config.collection_file_name);
  let collection = config.sqlite_file_name.slice(0, -7);
  const databasePath = appRoot + "/config/" + config.sqlite_file_name;

  if (mode != "force") {
    if (fs.existsSync(databasePath)) {
      console.log("Database exist.");
      return;
    }
  }

  fs.writeFileSync(databasePath, "", { flag: "w" });
  console.log("Database created.");

  const db = new Database(databasePath);

  let totalCollectionItem = 0;
  let traitTypeId = 0;
  let traitDetailTypeId = 0;
  let collectionItemTraitTypeId = 0;
  let collectionItemScoreId = 0;

  let traitTypeIdMap = {};
  let traitTypeCount = {};
  let traitDetailTypeIdMap = {};
  let traitDetailTypeCount = {};
  let collectionItemTraitTypeCount = {};

  let ignoreTraits = config.ignore_traits.map((ignore_trait) =>
    ignore_trait.toLowerCase()
  );

  db.exec(
    `CREATE TABLE ${collection}s (` +
      "id INT, " +
      "name TEXT, " +
      "description TEXT, " +
      "image TEXT, " +
      "external_url TEXT, " +
      "animation_url TEXT " +
      ")"
  );

  db.exec(
    `CREATE TABLE ${collection}_details (` +
      "collection_image TEXT, " +
      "discord TEXT, " +
      "twitter TEXT, " +
      "website TEXT " +
      ")"
  );

  db.exec(
    "CREATE TABLE trait_types (" +
      "id INT, " +
      "trait_type TEXT, " +
      "trait_data_type TEXT, " +
      `${collection}_count INT ` +
      ")"
  );

  db.exec(
    "CREATE TABLE trait_detail_types (" +
      "id INT, " +
      "trait_type_id INT, " +
      "trait_detail_type TEXT, " +
      `${collection}_count INT ` +
      ")"
  );

  db.exec(
    `CREATE TABLE ${collection}_traits (` +
      "id INT, " +
      `${collection}_id INT, ` +
      "trait_type_id INT, " +
      "value TEXT " +
      ")"
  );

  db.exec(
    `CREATE TABLE ${collection}_trait_counts (` +
      "trait_count INT, " +
      `${collection}_count INT ` +
      ")"
  );

  let insertCollectionDetails = db.prepare(
    `INSERT INTO ${collection}_details VALUES (?, ?, ?, ?)`
  );
  let insertCollectionItemStmt = db.prepare(
    `INSERT INTO ${collection}s VALUES (?, ?, ?, ?, ?, ?)`
  );
  let insertTraitTypeStmt = db.prepare(
    "INSERT INTO trait_types VALUES (?, ?, ?, ?)"
  );
  let insertTraitDetailTypeStmt = db.prepare(
    "INSERT INTO trait_detail_types VALUES (?, ?, ?, ?)"
  );
  let insertPuntTraitStmt = db.prepare(
    `INSERT INTO ${collection}_traits VALUES (?, ?, ?, ?)`
  );

  insertCollectionDetails.run(
    config.collection_image || "",
    config.discord || "",
    config.twitter || "",
    config.website || ""
  );

  let count1 = config.collection_id_from;
  collectionData.forEach((element) => {
    if (element.id != undefined) {
      element.id = element.id.toString();
    }
    if (element.id == undefined) {
      element["id"] = count1;
    }
    if (_.isEmpty(element.id)) {
      element["id"] = count1;
    }
    if (_.isEmpty(element.name)) {
      element["name"] = config.collection_name + " #" + element.id;
    }
    if (!element.name.includes("#" + element.id)) {
      element["name"] = element["name"];
    }
    if (_.isEmpty(element.description)) {
      element["description"] = "";
    }
    if (_.isEmpty(element.external_url)) {
      element["external_url"] = "";
    }
    if (_.isEmpty(element.animation_url)) {
      element["animation_url"] = "";
    }

    console.log(`Prepare ${collection}: #` + element.id);

    insertCollectionItemStmt.run(
      element.id,
      element.name,
      element.description,
      element.image,
      element.external_url,
      element.animation_url
    );

    let thisCollectionItemTraitTypes = [];

    if (_.isEmpty(element.attributes) && !_.isEmpty(element.traits)) {
      element.attributes = [];
      for (const [key, value] of Object.entries(element.traits)) {
        element.attributes.push({
          trait_type: key,
          value: value,
        });
      }
    }

    // fake data for date
    /*
    element.attributes.push({
        value: '2456221590',
        trait_type: 'date',
        display_type: 'date',
    });
    */

    element.attributes.forEach((attribute) => {
      if (attribute.value) {
        attribute.value = attribute.value.toString();
      }

      if (
        _.isEmpty(attribute.trait_type) ||
        _.isEmpty(attribute.value) ||
        attribute.value.toLowerCase() == "none" ||
        attribute.value.toLowerCase() == "nothing" ||
        attribute.value.toLowerCase() == "0"
      ) {
        return;
      }

      // Trait type
      if (!traitTypeCount.hasOwnProperty(attribute.trait_type)) {
        let traitDataType = "string";
        if (
          !_.isEmpty(attribute.display_type) &&
          attribute.display_type.toLowerCase() == "date"
        ) {
          traitDataType = "date";
        }
        insertTraitTypeStmt.run(
          traitTypeId,
          _.startCase(attribute.trait_type),
          traitDataType,
          0
        );
        traitTypeIdMap[attribute.trait_type] = traitTypeId;
        traitTypeId = traitTypeId + 1;
        if (!ignoreTraits.includes(attribute.trait_type.toLowerCase())) {
          traitTypeCount[attribute.trait_type] = 0 + 1;
        } else {
          traitTypeCount[attribute.trait_type] = 0;
        }
      } else {
        if (!ignoreTraits.includes(attribute.trait_type.toLowerCase())) {
          traitTypeCount[attribute.trait_type] =
            traitTypeCount[attribute.trait_type] + 1;
        } else {
          traitTypeCount[attribute.trait_type] = 0;
        }
      }

      // Trait detail type
      if (
        !traitDetailTypeCount.hasOwnProperty(
          attribute.trait_type + "|||" + attribute.value
        )
      ) {
        insertTraitDetailTypeStmt.run(
          traitDetailTypeId,
          traitTypeIdMap[attribute.trait_type],
          attribute.value,
          0
        );
        traitDetailTypeIdMap[attribute.trait_type + "|||" + attribute.value] =
          traitDetailTypeId;
        traitDetailTypeId = traitDetailTypeId + 1;
        if (!ignoreTraits.includes(attribute.trait_type.toLowerCase())) {
          traitDetailTypeCount[attribute.trait_type + "|||" + attribute.value] =
            0 + 1;
        } else {
          traitDetailTypeCount[
            attribute.trait_type + "|||" + attribute.value
          ] = 0;
        }
      } else {
        if (!ignoreTraits.includes(attribute.trait_type.toLowerCase())) {
          traitDetailTypeCount[attribute.trait_type + "|||" + attribute.value] =
            traitDetailTypeCount[
              attribute.trait_type + "|||" + attribute.value
            ] + 1;
        } else {
          traitDetailTypeCount[
            attribute.trait_type + "|||" + attribute.value
          ] = 0;
        }
      }

      insertPuntTraitStmt.run(
        collectionItemTraitTypeId,
        element.id,
        traitTypeIdMap[attribute.trait_type],
        attribute.value
      );
      collectionItemTraitTypeId = collectionItemTraitTypeId + 1;

      if (!ignoreTraits.includes(attribute.trait_type.toLowerCase())) {
        thisCollectionItemTraitTypes.push(attribute.trait_type);
      }
    });

    if (!collectionItemTraitTypeCount.hasOwnProperty(thisCollectionItemTraitTypes.length)) {
      collectionItemTraitTypeCount[thisCollectionItemTraitTypes.length] = 0 + 1;
    } else {
      collectionItemTraitTypeCount[thisCollectionItemTraitTypes.length] =
        collectionItemTraitTypeCount[thisCollectionItemTraitTypes.length] + 1;
    }

    totalCollectionItem = totalCollectionItem + 1;
    count1 = count1 + 1;
  });

  console.log(traitTypeCount);
  let updateTraitTypeStmt = db.prepare(
    `UPDATE trait_types SET ${collection}_count = :${collection}_count WHERE id = :id`
  );
  for (let traitType in traitTypeCount) {
    let thisTraitTypeCount = traitTypeCount[traitType];
    let traitTypeId = traitTypeIdMap[traitType];
    // const count = `${collection_count}`
    updateTraitTypeStmt.run({
      [`${collection}_count`]: thisTraitTypeCount,
      id: traitTypeId,
    });
  }
  console.log(traitDetailTypeCount);
  let updateTraitDetailTypeStmt = db.prepare(
    `UPDATE trait_detail_types SET ${collection}_count = :${collection}_count WHERE id = :id`
  );
  for (let traitDetailType in traitDetailTypeCount) {
    let thisTraitDetailTypeCount = traitDetailTypeCount[traitDetailType];
    let traitDetailTypeId = traitDetailTypeIdMap[traitDetailType];
    updateTraitDetailTypeStmt.run({
      [`${collection}_count`]: thisTraitDetailTypeCount,
      id: traitDetailTypeId,
    });
  }
  console.log(collectionItemTraitTypeCount);
  let insertCollectionItemTraitContStmt = db.prepare(
    `INSERT INTO ${collection}_trait_counts VALUES (?, ?)`
  );
  for (let countType in collectionItemTraitTypeCount) {
    let thisTypeCount = collectionItemTraitTypeCount[countType];
    insertCollectionItemTraitContStmt.run(countType, thisTypeCount);
  }

  let createScoreTableStmt = `CREATE TABLE ${collection}_scores ( id INT, ${collection}_id INT, `;
  let insertCollectionItemScoreStmt = `INSERT INTO ${collection}_scores VALUES (:id, :${collection}_id, `;

  for (let i = 0; i < traitTypeId; i++) {
    createScoreTableStmt =
      createScoreTableStmt +
      "trait_type_" +
      i +
      "_percentile DOUBLE, trait_type_" +
      i +
      "_rarity DOUBLE, trait_type_" +
      i +
      "_value TEXT, ";
    insertCollectionItemScoreStmt =
      insertCollectionItemScoreStmt +
      ":trait_type_" +
      i +
      "_percentile, :trait_type_" +
      i +
      "_rarity, :trait_type_" +
      i +
      "_value, ";
  }

  createScoreTableStmt =
    createScoreTableStmt +
    "trait_count INT,  trait_count_percentile DOUBLE, trait_count_rarity DOUBLE, rarity_sum DOUBLE, rarity_rank INT)";
  insertCollectionItemScoreStmt =
    insertCollectionItemScoreStmt +
    ":trait_count,  :trait_count_percentile, :trait_count_rarity, :rarity_sum, :rarity_rank)";

  db.exec(createScoreTableStmt);
  insertCollectionItemScoreStmt = db.prepare(insertCollectionItemScoreStmt);

  let count2 = config.collection_id_from;
  collectionData.forEach((element) => {
    if (element.id != undefined) {
      element.id = element.id.toString();
    }
    if (_.isEmpty(element.id)) {
      element["id"] = count2;
    }

    console.log(`Analyze ${collection}: #` + element.id);

    let thisCollectionItemTraitTypes = [];
    let thisCollectionItemDetailTraits = {};

    if (_.isEmpty(element.attributes) && !_.isEmpty(element.traits)) {
      element.attributes = [];
      for (const [key, value] of Object.entries(element.traits)) {
        element.attributes.push({
          trait_type: key,
          value: value,
        });
      }
    }

    element.attributes.forEach((attribute) => {
      if (attribute.value) {
        attribute.value = attribute.value.toString();
      }

      if (
        _.isEmpty(attribute.trait_type) ||
        _.isEmpty(attribute.value) ||
        attribute.value.toLowerCase() == "none" ||
        attribute.value.toLowerCase() == "nothing" ||
        attribute.value.toLowerCase() == "0"
      ) {
        return;
      }

      thisCollectionItemTraitTypes.push(attribute.trait_type);
      thisCollectionItemDetailTraits[attribute.trait_type] = attribute.value;
    });

    let collectionItemScore = {};
    let raritySum = 0;
    collectionItemScore["id"] = collectionItemScoreId;
    collectionItemScore[`${collection}_id`] = element.id;
    for (let traitType in traitTypeCount) {
      if (thisCollectionItemTraitTypes.includes(traitType)) {
        // has trait
        let traitDetailType = thisCollectionItemDetailTraits[traitType];
        let thisTraitDetailTypeCount =
          traitDetailTypeCount[traitType + "|||" + traitDetailType];
        let traitTypeId = traitTypeIdMap[traitType];
        if (!ignoreTraits.includes(traitType.toLowerCase())) {
          collectionItemScore["trait_type_" + traitTypeId + "_percentile"] =
            thisTraitDetailTypeCount / totalCollectionItem;
          collectionItemScore["trait_type_" + traitTypeId + "_rarity"] =
            totalCollectionItem / thisTraitDetailTypeCount;
          raritySum = raritySum + totalCollectionItem / thisTraitDetailTypeCount;
        } else {
          collectionItemScore["trait_type_" + traitTypeId + "_percentile"] = 0;
          collectionItemScore["trait_type_" + traitTypeId + "_rarity"] = 0;
          raritySum = raritySum + 0;
        }
        collectionItemScore["trait_type_" + traitTypeId + "_value"] = traitDetailType;
      } else {
        // missing trait
        let thisTraitTypeCount = traitTypeCount[traitType];
        let traitTypeId = traitTypeIdMap[traitType];
        if (!ignoreTraits.includes(traitType.toLowerCase())) {
          collectionItemScore["trait_type_" + traitTypeId + "_percentile"] =
            (totalCollectionItem - thisTraitTypeCount) / totalCollectionItem;
          collectionItemScore["trait_type_" + traitTypeId + "_rarity"] =
            totalCollectionItem / (totalCollectionItem - thisTraitTypeCount);
          raritySum = raritySum + totalCollectionItem / (totalCollectionItem - thisTraitTypeCount);
        } else {
          collectionItemScore["trait_type_" + traitTypeId + "_percentile"] = 0;
          collectionItemScore["trait_type_" + traitTypeId + "_rarity"] = 0;
          raritySum = raritySum + 0;
        }
        collectionItemScore["trait_type_" + traitTypeId + "_value"] = "None";
      }
    }

    thisCollectionItemTraitTypes = thisCollectionItemTraitTypes.filter(
      (thisCollectionItemTraitType) => !ignoreTraits.includes(thisCollectionItemTraitType)
    );
    let thisCollectionItemTraitTypeCount = thisCollectionItemTraitTypes.length;

    collectionItemScore["trait_count"] = thisCollectionItemTraitTypeCount;
    collectionItemScore["trait_count_percentile"] =
      collectionItemTraitTypeCount[thisCollectionItemTraitTypeCount] / totalCollectionItem;
    collectionItemScore["trait_count_rarity"] =
      totalCollectionItem / collectionItemTraitTypeCount[thisCollectionItemTraitTypeCount];
    raritySum =
      raritySum + totalCollectionItem / collectionItemTraitTypeCount[thisCollectionItemTraitTypeCount];
    collectionItemScore["rarity_sum"] = raritySum;
    collectionItemScore["rarity_rank"] = 0;

    insertCollectionItemScoreStmt.run(collectionItemScore);

    collectionItemScoreId = collectionItemScoreId + 1;
    count2 = count2 + 1;
  });

  const collectionItemScoreStmt = db.prepare(
    `SELECT rarity_sum FROM ${collection}_scores WHERE ${collection}_id = ?`
  );
  const collectionItemRankStmt = db.prepare(
    `SELECT COUNT(id) as higherRank FROM ${collection}_scores WHERE rarity_sum > ?`
  );
  let updatCollectionItemRankStmt = db.prepare(
    `UPDATE ${collection}_scores SET rarity_rank = :rarity_rank WHERE ${collection}_id = :${collection}_id`
  );

  let count3 = config.collection_id_from;
  collectionData.forEach((element) => {
    if (element.id != undefined) {
      element.id = element.id.toString();
    }
    if (_.isEmpty(element.id)) {
      element["id"] = count3;
    }

    console.log(`Ranking ${collection}: #` + element.id);
    let collectionItemScore = collectionItemScoreStmt.get(element.id);
    let collectionItemRank = collectionItemRankStmt.get(collectionItemScore.rarity_sum);
    updatCollectionItemRankStmt.run({
      rarity_rank: collectionItemRank.higherRank + 1,
      [`${collection}_id`]: element.id,
    });
    count3 = count3 + 1;
  });
};
