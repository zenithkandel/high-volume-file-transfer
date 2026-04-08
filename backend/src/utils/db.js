const fs = require('fs');
const path = require('path');

const getDbPath = () => path.resolve(process.env.DB_PATH || './db.json');

let memoryDb = null;

function initDb() {
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
        memoryDb = { files: {} };
        fs.writeFileSync(dbPath, JSON.stringify(memoryDb, null, 2));
    } else {
        memoryDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
}

function readDb() {
    if (!memoryDb) initDb();
    return memoryDb;
}

function writeDb(data) {
    memoryDb = data;
    fs.writeFileSync(getDbPath(), JSON.stringify(memoryDb, null, 2));
}

module.exports = { initDb, readDb, writeDb };
