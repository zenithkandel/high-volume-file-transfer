const fs = require('fs');
const path = require('path');

const getDbPath = () => path.resolve(process.env.DB_PATH || './db.json');

function initDb() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ files: {} }, null, 2));
  }
}

function readDb() {
  return JSON.parse(fs.readFileSync(getDbPath(), 'utf8'));
}

function writeDb(data) {
  fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2));
}

module.exports = { initDb, readDb, writeDb };
