const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'com.patrimoine-crm.app', 'patrimoine-crm.db');
const db = new Database(dbPath);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables existantes:');
tables.forEach(t => console.log('  -', t.name));

db.close();
