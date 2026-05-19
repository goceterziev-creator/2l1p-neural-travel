const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "DATABASE", "database.json");

function ensureDb() {
  const dir = path.dirname(DB_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify({ users: [], offers: [] }, null, 2),
      "utf8"
    );
  }
}

function readDb() {
  ensureDb();

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const db = JSON.parse(raw || "{}");

    return {
      users: Array.isArray(db.users) ? db.users : [],
      offers: Array.isArray(db.offers) ? db.offers : []
    };
  } catch (err) {
    console.error("DB READ ERROR:", err);
    return { users: [], offers: [] };
  }
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

module.exports = {
  readDb,
  writeDb
};