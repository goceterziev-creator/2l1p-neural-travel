const fs = require("fs");
const path = require("path");

function readJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    }
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = { readJson, writeJson };