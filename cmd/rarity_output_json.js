const appRoot = require('app-root-path');
const config = require(appRoot + '/config/config.js');
const Database = require('better-sqlite3');
const jsondata = require(appRoot + '/modules/jsondata.js');
const fs = require('fs');

let databasePath = appRoot + '/config/' + config.sqlite_file_name;

if (!fs.existsSync(databasePath)) {
  databasePath = appRoot + '/config/database.sqlite.sample';
}

const db = new Database(databasePath);
const outputPath = appRoot + '/config/collection-rarities.json';

fs.truncateSync(outputPath);

const logger = fs.createWriteStream(outputPath, {
  flags: 'a'
});

logger.write("[\n");

let totalPunkCount = db.prepare('SELECT COUNT(id) as collection_item_total FROM collection_items').get().collectionItem_total;
let collectionItems = db.prepare('SELECT collection_items.* FROM collection_items ORDER BY id').all();

let count = 0;
collectionItems.forEach(collectionItem => {
    console.log("Process collectionItem: #" + collectionItem.id);
    if ((count+1) == totalPunkCount) {
        logger.write(JSON.stringify(jsondata.collectionItem(collectionItem))+"\n");
    } else {
        logger.write(JSON.stringify(jsondata.collectionItem(collectionItem))+",\n");
    }
    count++
});

logger.write("]");

logger.end();