const appRoot = require('app-root-path');
const config = require(appRoot + '/config/config.js');
const fs = require('fs');
const Database = require('better-sqlite3');
const _ = require('lodash');

let databasePath = appRoot + '/config/' + config.sqlite_file_name;

if (!fs.existsSync(databasePath)) {
  databasePath = appRoot + '/config/database.sqlite.sample';
}

const db = new Database(databasePath);

exports.collectionItem = function (collectionItem, scoreTable,collection) {
  let collectionItemId = collectionItem.id;
  console.log(
    `SELECT ${collection}_traits.trait_type_id, trait_types.trait_type, ${collection}_traits.value  FROM ${collection}_traits`
  );
  let collectionItemTraits = db.prepare(`SELECT ${collection}_traits.trait_type_id, trait_types.trait_type, ${collection}_traits.value FROM ${collection}_traits INNER JOIN trait_types ON (${collection}_traits.trait_type_id = trait_types.id) WHERE ${collection}_traits.${collection}_id = ?`).all(collectionItemId);
  let collectionItemScore = db.prepare('SELECT '+scoreTable+'.* FROM '+scoreTable+' WHERE '+scoreTable+`.${collection}_id = ?`).get(collectionItemId);
  let allTraitTypes = db.prepare('SELECT trait_types.* FROM trait_types').all();
  
  let collectionItemTraitsData = [];
  let collectionItemTraitIDs = [];
  collectionItemTraits.forEach(collectionItemTrait => {
    let percentile = collectionItemScore['trait_type_'+collectionItemTrait.trait_type_id+'_percentile'];
    let rarity_score = collectionItemScore['trait_type_'+collectionItemTrait.trait_type_id+'_rarity'];
    collectionItemTraitsData.push({
      trait_type: collectionItemTrait.trait_type,
      value: collectionItemTrait.value,
      percentile: percentile,
      rarity_score: rarity_score,
    });
    collectionItemTraitIDs.push(collectionItemTrait.trait_type_id);
  });

  let missingTraitsData = [];
  allTraitTypes.forEach(traitType => {
    if (!collectionItemTraitIDs.includes(traitType.id)) {
      let percentile = collectionItemScore['trait_type_'+traitType.id+'_percentile'];
      let rarity_score = collectionItemScore['trait_type_'+traitType.id+'_rarity'];
      missingTraitsData.push({
        trait_type: traitType.trait_type,
        percentile: percentile,
        rarity_score: rarity_score,
      });
    }
  });

  return {
    id: collectionItem.id,
    name: collectionItem.name,
    image: collectionItem.image,
    attributes: collectionItemTraitsData,
    missing_traits: missingTraitsData,
    trait_count: {
      count: collectionItemScore.trait_count,
      percentile: collectionItemScore.trait_count_percentile,
      rarity_score: collectionItemScore.trait_count_rarity
    },
    rarity_score: collectionItemScore.rarity_sum,
    rarity_rank: collectionItemScore.rarity_rank
  };
};