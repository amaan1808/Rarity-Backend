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

exports.punk = function (punk, scoreTable,collection) {
  let punkId = punk.id;
  console.log(
    `SELECT ${collection}_traits.trait_type_id, trait_types.trait_type, ${collection}_traits.value  FROM ${collection}_traits`
  );
  let punkTraits = db.prepare(`SELECT ${collection}_traits.trait_type_id, trait_types.trait_type, ${collection}_traits.value FROM ${collection}_traits INNER JOIN trait_types ON (${collection}_traits.trait_type_id = trait_types.id) WHERE ${collection}_traits.${collection}_id = ?`).all(punkId);
  let punkScore = db.prepare('SELECT '+scoreTable+'.* FROM '+scoreTable+' WHERE '+scoreTable+`.${collection}_id = ?`).get(punkId);
  let allTraitTypes = db.prepare('SELECT trait_types.* FROM trait_types').all();
  
  let punkTraitsData = [];
  let punkTraitIDs = [];
  punkTraits.forEach(punkTrait => {
    let percentile = punkScore['trait_type_'+punkTrait.trait_type_id+'_percentile'];
    let rarity_score = punkScore['trait_type_'+punkTrait.trait_type_id+'_rarity'];
    punkTraitsData.push({
      trait_type: punkTrait.trait_type,
      value: punkTrait.value,
      percentile: percentile,
      rarity_score: rarity_score,
    });
    punkTraitIDs.push(punkTrait.trait_type_id);
  });

  let missingTraitsData = [];
  allTraitTypes.forEach(traitType => {
    if (!punkTraitIDs.includes(traitType.id)) {
      let percentile = punkScore['trait_type_'+traitType.id+'_percentile'];
      let rarity_score = punkScore['trait_type_'+traitType.id+'_rarity'];
      missingTraitsData.push({
        trait_type: traitType.trait_type,
        percentile: percentile,
        rarity_score: rarity_score,
      });
    }
  });

  return {
    id: punk.id,
    name: punk.name,
    image: punk.image,
    attributes: punkTraitsData,
    missing_traits: missingTraitsData,
    trait_count: {
      count: punkScore.trait_count,
      percentile: punkScore.trait_count_percentile,
      rarity_score: punkScore.trait_count_rarity
    },
    rarity_score: punkScore.rarity_sum,
    rarity_rank: punkScore.rarity_rank
  };
};