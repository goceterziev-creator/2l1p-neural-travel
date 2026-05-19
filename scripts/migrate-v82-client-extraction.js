const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const dbFile = path.join(root, "DATABASE", "database.json");
const backupDir = path.join(root, "backups");
const DEFAULT_AGENCY_ID = process.env.AGENCY_ID || "AGY-AYA";

function stripBom(raw) {
  return String(raw || "").replace(/^\uFEFF/, "");
}

function foundationId(prefix, value = "") {
  const hash = crypto
    .createHash("sha1")
    .update(String(value || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
  return `${prefix}_${hash}`;
}

function toNumber(value, fallback = 0) {
  const normalized = String(value ?? "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  const clean = digits.startsWith("+")
    ? `+${digits.slice(1).replace(/\D/g, "")}`
    : digits.replace(/\D/g, "");
  if (clean.startsWith("00")) return `+${clean.slice(2)}`;
  if (clean.startsWith("359") && clean.length >= 11) return `+${clean}`;
  return clean;
}

function normalizeClientName(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeClientTags(value = []) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim());
  return [...new Set(raw.filter(Boolean))];
}

function normalizeClientPreferences(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function buildClientIdentity(source = {}) {
  const agencyId = source.agencyId || DEFAULT_AGENCY_ID;
  const name = String(source.clientName || source.name || "Unknown client").trim();
  const phone = String(source.clientPhone || source.phone || "").trim();
  const email = String(source.clientEmail || source.email || "").trim();
  const phoneNormalized = normalizePhone(phone);
  const emailNormalized = normalizeEmail(email);
  const nameNormalized = normalizeClientName(name);
  const identityKey = emailNormalized || phoneNormalized || nameNormalized || "unknown";

  return {
    agencyId,
    name,
    phone,
    email,
    phoneNormalized,
    emailNormalized,
    nameNormalized,
    clientId: source.clientId || source.id || foundationId("client", `${agencyId}|${identityKey}`)
  };
}

function createClientFromSource(source = {}, now = new Date().toISOString()) {
  const identity = buildClientIdentity(source);
  return {
    id: identity.clientId,
    clientId: identity.clientId,
    agencyId: identity.agencyId,
    name: identity.name,
    nameNormalized: identity.nameNormalized,
    phone: identity.phone,
    phoneNormalized: identity.phoneNormalized,
    email: identity.email,
    emailNormalized: identity.emailNormalized,
    preferences: normalizeClientPreferences(source.clientPreferences || source.preferences),
    notes: source.clientNotes || source.notes || "",
    tags: normalizeClientTags(source.clientTags || source.tags),
    offerIds: Array.isArray(source.offerIds) ? source.offerIds : [],
    offerHistory: [],
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now
  };
}

function findClient(clients = [], source = {}) {
  const identity = buildClientIdentity(source);
  const agencyClients = clients.filter((client) => (client.agencyId || DEFAULT_AGENCY_ID) === identity.agencyId);

  if (identity.clientId) {
    const byId = agencyClients.find((client) => (client.clientId || client.id) === identity.clientId);
    if (byId) return byId;
  }

  if (identity.emailNormalized) {
    const byEmail = agencyClients.find((client) => normalizeEmail(client.emailNormalized || client.email) === identity.emailNormalized);
    if (byEmail) return byEmail;
  }

  if (identity.phoneNormalized) {
    const byPhone = agencyClients.find((client) => normalizePhone(client.phoneNormalized || client.phone) === identity.phoneNormalized);
    if (byPhone) return byPhone;
  }

  if (!identity.emailNormalized && !identity.phoneNormalized && identity.nameNormalized) {
    return agencyClients.find((client) => normalizeClientName(client.nameNormalized || client.name) === identity.nameNormalized) || null;
  }

  return null;
}

function mergeClient(target, source = {}, now = new Date().toISOString()) {
  const next = createClientFromSource(source, now);
  target.id = target.id || next.id;
  target.clientId = target.clientId || target.id;
  target.agencyId = target.agencyId || next.agencyId;
  target.name = next.name !== "Unknown client" ? next.name : target.name || next.name;
  target.nameNormalized = normalizeClientName(target.name);
  target.phone = next.phone || target.phone || "";
  target.phoneNormalized = normalizePhone(next.phoneNormalized || target.phone);
  target.email = next.email || target.email || "";
  target.emailNormalized = normalizeEmail(next.emailNormalized || target.email);
  target.preferences = { ...normalizeClientPreferences(target.preferences), ...next.preferences };
  target.notes = [target.notes, next.notes].filter(Boolean).join(target.notes && next.notes ? "\n" : "");
  target.tags = normalizeClientTags([...(target.tags || []), ...(next.tags || [])]);
  target.offerIds = [...new Set([...(target.offerIds || []), ...(next.offerIds || [])].filter(Boolean))];
  target.offerHistory = [];
  target.createdAt = target.createdAt || next.createdAt;
  target.updatedAt = now;
  return target;
}

function historyItem(offer = {}) {
  return {
    offerId: offer.id || offer.offerId,
    status: offer.status || "draft",
    destination: offer.destination || "",
    travelDates: offer.travelDates || "",
    guests: offer.guests || "",
    finalPrice: toNumber(offer.finalPrice || offer.price, 0),
    currency: offer.currency || "EUR",
    createdAt: offer.createdAt || null,
    updatedAt: offer.updatedAt || null,
    viewed: Boolean(offer.clientViewed),
    bookedAt: offer.bookedAt || null
  };
}

const now = new Date().toISOString();
const db = JSON.parse(stripBom(fs.readFileSync(dbFile, "utf8")));
fs.mkdirSync(backupDir, { recursive: true });

const backupFile = path.join(
  backupDir,
  `database-v8.2-client-extraction-${now.replace(/[:.]/g, "-")}.json`
);
fs.copyFileSync(dbFile, backupFile);

const clients = [];

(Array.isArray(db.clients) ? db.clients : []).forEach((client) => {
  const existing = findClient(clients, client);
  if (existing) mergeClient(existing, client, now);
  else clients.push(createClientFromSource(client, now));
});

(Array.isArray(db.offers) ? db.offers : []).forEach((offer) => {
  offer.agencyId = offer.agencyId || DEFAULT_AGENCY_ID;
  const existing = findClient(clients, offer);
  const client = existing || createClientFromSource(offer, now);
  if (!existing) clients.push(client);
  else {
    const offerIds = Array.isArray(client.offerIds) ? client.offerIds : [];
    const offerHistory = Array.isArray(client.offerHistory) ? client.offerHistory : [];
    mergeClient(client, offer, now);
    client.offerIds = offerIds;
    client.offerHistory = offerHistory;
  }

  offer.clientId = client.clientId || client.id;
  client.offerIds = Array.isArray(client.offerIds) ? client.offerIds : [];
  if (offer.id && !client.offerIds.includes(offer.id)) client.offerIds.push(offer.id);
  client.offerHistory = Array.isArray(client.offerHistory) ? client.offerHistory : [];
  client.offerHistory.push(historyItem(offer));
});

clients.forEach((client) => {
  client.offerIds = [...new Set((client.offerIds || []).filter(Boolean))];
  client.offerHistory = (client.offerHistory || []).sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
  client.updatedAt = now;
});

db.clients = clients;
db.schemaVersion = "8.2.0";
db.meta = {
  ...(db.meta || {}),
  clientExtractionMigratedAt: now,
  clientExtractionBackupFile: backupFile,
  updatedAt: now
};
db.activities = Array.isArray(db.activities) ? db.activities : [];
db.activities.unshift({
  id: `act_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
  type: "client_extraction_migrated",
  userId: "system",
  offerId: null,
  clientId: null,
  agencyId: DEFAULT_AGENCY_ID,
  timestamp: now,
  metadata: {
    schemaVersion: "8.2.0",
    backupFile,
    clients: clients.length
  }
});

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      schemaVersion: db.schemaVersion,
      clients: clients.length,
      offers: Array.isArray(db.offers) ? db.offers.length : 0,
      backupFile
    },
    null,
    2
  )
);
