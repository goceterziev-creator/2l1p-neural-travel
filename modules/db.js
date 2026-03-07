const fs = require("fs");
const path = require("path");
const DB_PATH = path.join(__dirname, "..", "DATABASE", "database.json");
function ensureDb() { if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ offers: [] }, null, 2), "utf-8"); }
function readDb() { ensureDb(); return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")); }
function writeDb(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8"); }
function getAllOffers() { return (readDb().offers || []); }
function getOfferById(id) { return getAllOffers().find((offer) => offer.id === id); }
function saveOffer(offer) { const db = readDb(); db.offers.unshift(offer); writeDb(db); return offer; }
function updateOffer(id, patch) { const db = readDb(); const i = (db.offers || []).findIndex((offer) => offer.id === id); if (i === -1) return null; db.offers[i] = { ...db.offers[i], ...patch, updatedAt: new Date().toISOString() }; writeDb(db); return db.offers[i]; }
module.exports = { readDb, writeDb, getAllOffers, getOfferById, saveOffer, updateOffer };
