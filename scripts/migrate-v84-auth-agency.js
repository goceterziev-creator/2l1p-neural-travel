const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const dbFile = path.join(root, "DATABASE", "database.json");
const backupDir = path.join(root, "backups");
const DEFAULT_AGENCY_ID = process.env.AGENCY_ID || "AGY-AYA";
const DEFAULT_AGENCY_NAME = process.env.AGENCY_NAME || "AYA Travel";

function stripBom(raw) {
  return String(raw || "").replace(/^\uFEFF/, "");
}

function normalizeRole(role = "") {
  const cleanRole = String(role || "").toLowerCase();
  return ["admin", "agent", "viewer"].includes(cleanRole) ? cleanRole : "agent";
}

function permissionsForRole(role = "") {
  const cleanRole = normalizeRole(role);
  const permissions = {
    viewer: ["offers:read", "clients:read", "activities:read", "agency:read"],
    agent: [
      "offers:read",
      "offers:write",
      "clients:read",
      "clients:write",
      "activities:read",
      "agency:read"
    ],
    admin: [
      "offers:read",
      "offers:write",
      "clients:read",
      "clients:write",
      "activities:read",
      "agency:read",
      "agency:write",
      "users:read",
      "users:write"
    ]
  };
  return permissions[cleanRole] || permissions.agent;
}

function normalizeActivity(activity = {}) {
  const timestamp = activity.timestamp || activity.createdAt || new Date().toISOString();
  return {
    id: activity.id || `act_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    type: String(activity.type || "activity").toLowerCase(),
    category: activity.category || "system",
    userId: activity.userId || null,
    actorType: activity.actorType || (activity.userId === "system" ? "system" : "user"),
    offerId: activity.offerId || null,
    clientId: activity.clientId || null,
    agencyId: activity.agencyId || DEFAULT_AGENCY_ID,
    timestamp,
    createdAt: activity.createdAt || timestamp,
    metadata: activity.metadata && typeof activity.metadata === "object" ? activity.metadata : {}
  };
}

const now = new Date().toISOString();
const db = JSON.parse(stripBom(fs.readFileSync(dbFile, "utf8")));
fs.mkdirSync(backupDir, { recursive: true });

const backupFile = path.join(
  backupDir,
  `database-v8.4-auth-agency-${now.replace(/[:.]/g, "-")}.json`
);
fs.copyFileSync(dbFile, backupFile);

db.agencies = Array.isArray(db.agencies) ? db.agencies : [];
let agency = db.agencies.find((item) => item.agencyId === DEFAULT_AGENCY_ID || item.id === DEFAULT_AGENCY_ID);
if (!agency) {
  agency = {
    id: DEFAULT_AGENCY_ID,
    agencyId: DEFAULT_AGENCY_ID,
    name: DEFAULT_AGENCY_NAME,
    status: "active",
    plan: "PRO",
    settings: {},
    createdAt: now
  };
  db.agencies.unshift(agency);
}

agency.id = agency.id || DEFAULT_AGENCY_ID;
agency.agencyId = agency.agencyId || agency.id;
agency.name = agency.name || DEFAULT_AGENCY_NAME;
agency.status = agency.status || "active";
agency.plan = agency.plan || "PRO";
agency.settings = {
  defaultMarkupPercent: 5,
  currencies: ["EUR", "BGN", "USD"],
  ...(agency.settings || {})
};
agency.updatedAt = now;

db.users = Array.isArray(db.users) ? db.users : [];
db.users.forEach((user) => {
  user.userId = user.userId || user.id;
  user.agencyId = user.agencyId || DEFAULT_AGENCY_ID;
  user.agencyName = user.agencyName || DEFAULT_AGENCY_NAME;
  user.role = normalizeRole(user.role || (String(user.id || "").includes("ADMIN") ? "admin" : "agent"));
  user.status = user.status || "active";
  user.permissions = permissionsForRole(user.role);
  user.updatedAt = now;
});

(Array.isArray(db.offers) ? db.offers : []).forEach((offer) => {
  offer.agencyId = offer.agencyId || DEFAULT_AGENCY_ID;
  offer.agencyName = offer.agencyName || DEFAULT_AGENCY_NAME;
  offer.visibility = offer.visibility || "private";
  offer.userId = offer.userId || offer.createdBy || "USR-ADMIN";
  offer.createdBy = offer.createdBy || offer.userId;
});

(Array.isArray(db.clients) ? db.clients : []).forEach((client) => {
  client.agencyId = client.agencyId || DEFAULT_AGENCY_ID;
});

db.schemaVersion = "8.4.0";
db.meta = {
  ...(db.meta || {}),
  authAgencyMigratedAt: now,
  authAgencyBackupFile: backupFile,
  updatedAt: now
};
db.activities = Array.isArray(db.activities) ? db.activities : [];
db.activities.unshift(normalizeActivity({
  type: "auth_agency_migrated",
  userId: "system",
  agencyId: DEFAULT_AGENCY_ID,
  timestamp: now,
  metadata: {
    schemaVersion: "8.4.0",
    backupFile,
    users: db.users.length,
    agencies: db.agencies.length
  }
}));

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf8");

console.log(JSON.stringify({
  schemaVersion: db.schemaVersion,
  users: db.users.length,
  agencies: db.agencies.length,
  roles: db.users.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {}),
  backupFile
}, null, 2));
