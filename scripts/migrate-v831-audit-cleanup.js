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

function normalizeActivityType(type = "") {
  return String(type || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function inferActivityCategory(type = "") {
  if (type.includes("client")) return "client";
  if (type.includes("pdf") || type.includes("whatsapp") || type.includes("viewed") || type.includes("click")) return "engagement";
  if (type.includes("status") || type.includes("book")) return "workflow";
  if (type.includes("migrated") || type.includes("foundation") || type.includes("cleanup")) return "system";
  return "offer";
}

function actorTypeFromUserId(userId = "") {
  if (!userId) return "unknown";
  if (userId === "public") return "client";
  if (userId === "system") return "system";
  return "user";
}

function normalizeActivity(activity = {}, index = 0) {
  const type = normalizeActivityType(activity.type || "activity");
  const timestamp = activity.timestamp || activity.createdAt || new Date().toISOString();

  return {
    id: activity.id || `act_${Date.now()}_${index}_${crypto.randomBytes(2).toString("hex")}`,
    type,
    category: activity.category || inferActivityCategory(type),
    userId: activity.userId || null,
    actorType: activity.actorType || actorTypeFromUserId(activity.userId),
    offerId: activity.offerId || null,
    clientId: activity.clientId || null,
    agencyId: activity.agencyId || DEFAULT_AGENCY_ID,
    timestamp,
    createdAt: activity.createdAt || timestamp,
    metadata: activity.metadata && typeof activity.metadata === "object" ? activity.metadata : {}
  };
}

function isMigrationActivity(activity = {}) {
  const type = normalizeActivityType(activity.type || "");
  return type.endsWith("_migrated") || type.includes("migration");
}

function migrationDedupeKey(activity = {}) {
  return `${normalizeActivityType(activity.type || "")}:${activity.metadata?.schemaVersion || ""}`;
}

function dedupeMigrationActivities(activities = []) {
  const sorted = activities
    .map(normalizeActivity)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const seen = new Set();
  const kept = [];
  let removed = 0;

  sorted.forEach((activity) => {
    if (!isMigrationActivity(activity)) {
      kept.push(activity);
      return;
    }

    const key = migrationDedupeKey(activity);
    if (seen.has(key)) {
      removed += 1;
      return;
    }

    seen.add(key);
    kept.push(activity);
  });

  return {
    activities: kept.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)),
    removed
  };
}

const now = new Date().toISOString();
const db = JSON.parse(stripBom(fs.readFileSync(dbFile, "utf8")));
fs.mkdirSync(backupDir, { recursive: true });

const backupFile = path.join(
  backupDir,
  `database-v8.3.1-audit-cleanup-${now.replace(/[:.]/g, "-")}.json`
);
fs.copyFileSync(dbFile, backupFile);

const before = Array.isArray(db.activities) ? db.activities.length : 0;
const cleanup = dedupeMigrationActivities(Array.isArray(db.activities) ? db.activities : []);
db.activities = cleanup.activities;

db.schemaVersion = "8.3.1";
db.meta = {
  ...(db.meta || {}),
  auditCleanupMigratedAt: now,
  auditCleanupBackupFile: backupFile,
  auditCleanupRemovedEvents: cleanup.removed,
  updatedAt: now
};
db.activities.unshift(normalizeActivity({
  type: "audit_cleanup_migrated",
  userId: "system",
  agencyId: DEFAULT_AGENCY_ID,
  timestamp: now,
  metadata: {
    schemaVersion: "8.3.1",
    backupFile,
    before,
    after: db.activities.length,
    removed: cleanup.removed,
    preserved: [
      "offer_viewed",
      "status_changed",
      "pdf_downloaded",
      "whatsapp_clicked"
    ]
  }
}));
const finalCleanup = dedupeMigrationActivities(db.activities);
db.activities = finalCleanup.activities;
db.meta.auditCleanupRemovedEvents += finalCleanup.removed;

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf8");

const byType = db.activities.reduce((acc, activity) => {
  acc[activity.type] = (acc[activity.type] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  schemaVersion: db.schemaVersion,
  before,
  after: db.activities.length,
  removed: cleanup.removed,
  byType,
  backupFile
}, null, 2));
