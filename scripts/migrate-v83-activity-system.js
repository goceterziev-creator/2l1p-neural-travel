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

function toNumber(value, fallback = 0) {
  const normalized = String(value ?? "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
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
  if (type.includes("migrated") || type.includes("foundation")) return "system";
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

function hasEvent(activities, type, offerId, predicate = () => true) {
  return activities.some((activity) => activity.type === type && activity.offerId === offerId && predicate(activity));
}

const now = new Date().toISOString();
const db = JSON.parse(stripBom(fs.readFileSync(dbFile, "utf8")));
fs.mkdirSync(backupDir, { recursive: true });

const backupFile = path.join(
  backupDir,
  `database-v8.3-activity-system-${now.replace(/[:.]/g, "-")}.json`
);
fs.copyFileSync(dbFile, backupFile);

db.activities = (Array.isArray(db.activities) ? db.activities : []).map(normalizeActivity);

(Array.isArray(db.offers) ? db.offers : []).forEach((offer) => {
  const agencyId = offer.agencyId || DEFAULT_AGENCY_ID;
  const clientId = offer.clientId || null;

  if (!hasEvent(db.activities, "offer_created", offer.id)) {
    db.activities.push(normalizeActivity({
      type: "offer_created",
      userId: offer.createdBy || offer.userId || "system",
      offerId: offer.id,
      clientId,
      agencyId,
      timestamp: offer.createdAt || now,
      metadata: {
        status: offer.status || "draft",
        destination: offer.destination || "",
        source: "v8.3_backfill"
      }
    }));
  }

  if (offer.clientViewed && !hasEvent(db.activities, "offer_viewed", offer.id)) {
    db.activities.push(normalizeActivity({
      type: "offer_viewed",
      userId: "public",
      offerId: offer.id,
      clientId,
      agencyId,
      timestamp: offer.updatedAt || offer.createdAt || now,
      metadata: {
        clientViews: toNumber(offer.clientViews, 1),
        source: "v8.3_backfill"
      }
    }));
  }

  if (toNumber(offer.pdfDownloads, 0) > 0 && !hasEvent(db.activities, "pdf_downloaded", offer.id)) {
    db.activities.push(normalizeActivity({
      type: "pdf_downloaded",
      userId: "public",
      offerId: offer.id,
      clientId,
      agencyId,
      timestamp: offer.updatedAt || offer.createdAt || now,
      metadata: {
        pdfDownloads: toNumber(offer.pdfDownloads, 0),
        source: "v8.3_backfill"
      }
    }));
  }

  if (toNumber(offer.clicks, 0) > 0 && !hasEvent(db.activities, "whatsapp_clicked", offer.id)) {
    db.activities.push(normalizeActivity({
      type: "whatsapp_clicked",
      userId: "public",
      offerId: offer.id,
      clientId,
      agencyId,
      timestamp: offer.updatedAt || offer.createdAt || now,
      metadata: {
        clicks: toNumber(offer.clicks, 0),
        source: "v8.3_backfill"
      }
    }));
  }

  if ((offer.bookedAt || String(offer.status || "").toLowerCase() === "booked") &&
      !hasEvent(db.activities, "status_changed", offer.id, (activity) => activity.metadata?.to === "booked")) {
    db.activities.push(normalizeActivity({
      type: "status_changed",
      userId: offer.createdBy || offer.userId || "system",
      offerId: offer.id,
      clientId,
      agencyId,
      timestamp: offer.bookedAt || offer.updatedAt || offer.createdAt || now,
      metadata: {
        to: "booked",
        source: "v8.3_backfill"
      }
    }));
  }
});

db.activities = db.activities
  .map(normalizeActivity)
  .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

db.schemaVersion = "8.3.0";
db.meta = {
  ...(db.meta || {}),
  activitySystemMigratedAt: now,
  activitySystemBackupFile: backupFile,
  updatedAt: now
};
db.activities.unshift(normalizeActivity({
  type: "activity_system_migrated",
  userId: "system",
  agencyId: DEFAULT_AGENCY_ID,
  timestamp: now,
  metadata: {
    schemaVersion: "8.3.0",
    backupFile,
    activities: db.activities.length
  }
}));

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf8");

const byType = db.activities.reduce((acc, activity) => {
  acc[activity.type] = (acc[activity.type] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  schemaVersion: db.schemaVersion,
  activities: db.activities.length,
  byType,
  backupFile
}, null, 2));
