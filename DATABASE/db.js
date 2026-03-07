const Database = require("better-sqlite3");

const db = new Database("./DATABASE/database.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS offers (
id TEXT PRIMARY KEY,
clientName TEXT,
clientPhone TEXT,
destination TEXT,
flightRoute TEXT,
hotel TEXT,
travelDates TEXT,
guests TEXT,
basePrice REAL,
markupPercent REAL,
price REAL,
marginAmount REAL,
currency TEXT,
status TEXT,
createdAt TEXT,
validUntil TEXT,
notes TEXT,
clientViewed INTEGER
)
`).run();

module.exports = db;