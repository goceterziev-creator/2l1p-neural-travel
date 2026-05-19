const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");

const root = path.join(__dirname, "..");
const dbFile = path.join(root, "DATABASE", "database.json");
const backupFile = path.join(
  root,
  "backups",
  `database-pre-encoding-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
);

const decoder1251 = new TextDecoder("windows-1251");
const cp1251Reverse = new Map();

for (let i = 0; i < 256; i += 1) {
  cp1251Reverse.set(decoder1251.decode(Uint8Array.of(i)), i);
}

const mojibakePattern =
  /(РІ|Рµ|РЅ|Р°|Рѕ|Рї|Р»|Рґ|Рќ|Рџ|Р |Рё|СЂ|С‚|СЊ|СЉ|С†|С‡|С€|С‰|СЋ|СЏ|СЃ|С‹)/;

function stripBom(raw) {
  return String(raw || "").replace(/^\uFEFF/, "");
}

function decodeCp1251Mojibake(value) {
  const bytes = [];

  for (const ch of value) {
    if (!cp1251Reverse.has(ch)) return value;
    bytes.push(cp1251Reverse.get(ch));
  }

  return Buffer.from(bytes).toString("utf8");
}

function shouldRepair(value, repaired) {
  if (!mojibakePattern.test(value)) return false;
  if (!/[а-яА-Я]/.test(repaired)) return false;
  if (repaired.includes("\uFFFD")) return false;

  const beforeHits = (value.match(mojibakePattern) || []).length;
  const afterHits = (repaired.match(mojibakePattern) || []).length;

  return beforeHits > afterHits;
}

function repairValue(value, stats) {
  if (typeof value === "string") {
    const repaired = decodeCp1251Mojibake(value);
    if (repaired !== value && shouldRepair(value, repaired)) {
      stats.strings += 1;
      return repaired;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => repairValue(item, stats));
  }

  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      value[key] = repairValue(value[key], stats);
    }
  }

  return value;
}

const raw = fs.readFileSync(dbFile, "utf8");
const db = JSON.parse(stripBom(raw));
const stats = { strings: 0 };

fs.copyFileSync(dbFile, backupFile);
repairValue(db, stats);

db.meta = {
  ...(db.meta || {}),
  encodingRepairedAt: new Date().toISOString(),
  encodingRepairBackupFile: backupFile
};

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      repairedStrings: stats.strings,
      backupFile,
      schemaVersion: db.schemaVersion,
      offers: Array.isArray(db.offers) ? db.offers.length : 0
    },
    null,
    2
  )
);
