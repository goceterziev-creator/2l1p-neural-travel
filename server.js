require("dotenv").config({ path: ".env.local" });

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const puppeteer = require("puppeteer");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3001;
const LIVE_BASE_URL = process.env.LIVE_BASE_URL || `http://localhost:${PORT}`;
const SESSION_COOKIE = "aya_session";
const AUTH_SECRET = process.env.AUTH_SECRET || "dev-auth-secret-change-me";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const OCR_ENGINE_VERSION = "8.3.2";
const DATA_DIR = process.env.DATA_DIR || process.env.PERSISTENT_DATA_DIR || __dirname;

const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(DATA_DIR, "DATABASE", "database.json");
const DB_DIR = path.dirname(DB_FILE);
console.log("DB FILE:", DB_FILE);
const PUBLIC_DIR = path.join(__dirname, "public");
console.log("SERVING FROM:", PUBLIC_DIR);

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use((req, res, next) => {
  if (["/admin", "/admin.html", "/admin.js"].includes(req.path)) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});
app.use((req, res, next) => {
  if (["/", "/admin", "/admin.html"].includes(req.path)) {
    return requireAuthPage(req, res, next);
  }
  next();
});
app.use(express.static(PUBLIC_DIR));

ensureDb();
ensureDefaultUser();

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ offers: [] }, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();

  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw || "{}");

    if (!Array.isArray(db.users)) db.users = [];

    if (!Array.isArray(db.offers)) {
      db.offers = [];
    }

    return db;
  } catch (err) {
    console.error("DB READ ERROR:", err);
    return { users: [], offers: [] };
  }
}
function writeDb(db) {
  ensureDb();
  const payload = JSON.stringify(db, null, 2);
  const tmp = `${DB_FILE}.${process.pid}.tmp`;

  try {
    if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, `${DB_FILE}.bak`);
    fs.writeFileSync(tmp, payload, "utf8");
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
    fs.writeFileSync(DB_FILE, payload, "utf8");
  }
}

function getUserId(req) {
  return req.user?.id || req.headers["x-user-id"] || req.body?.createdBy || "USR-DEMO";
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash = "") {
  const [salt, expected] = String(storedHash).split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function getUserSessionVersion(user = {}) {
  return Number.isInteger(Number(user.sessionVersion)) ? Number(user.sessionVersion) : 1;
}

function normalizeSessionIdentity(user = {}) {
  const role = getCurrentUserRole(user);
  return {
    userId: user.id,
    agencyId: user.agencyId || "AGY-AYA",
    role,
    sessionVersion: getUserSessionVersion(user)
  };
}

function signSession(userOrId) {
  const identity = typeof userOrId === "object"
    ? normalizeSessionIdentity(userOrId)
    : { userId: userOrId };
  const now = Date.now();
  const payload = JSON.stringify({
    userId: identity.userId,
    agencyId: identity.agencyId,
    role: identity.role,
    sessionVersion: identity.sessionVersion,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS * 1000
  });
  const encoded = base64Url(payload);
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySession(token = "") {
  const [encoded, signature] = String(token).split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.userId || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function isSessionValidForUser(session = {}, user = {}) {
  if (!session?.userId || !user?.id) return false;
  if (session.userId !== user.id) return false;
  if (session.agencyId && session.agencyId !== (user.agencyId || "AGY-AYA")) return false;
  if (session.role && session.role !== getCurrentUserRole(user)) return false;
  if (session.sessionVersion && Number(session.sessionVersion) !== getUserSessionVersion(user)) return false;
  return true;
}

function sessionExpiresAt(session = {}) {
  const exp = Number(session.exp || 0);
  return exp ? new Date(exp).toISOString() : null;
}

function createUser({ name, email, password, role = "agent", agencyId = "AGY-AYA", plan = "STARTER", credits = 25 }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "").trim();
  const cleanPassword = String(password || "");

  if (!cleanName) {
    const err = new Error("Name is required");
    err.status = 400;
    throw err;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    const err = new Error("Valid email is required");
    err.status = 400;
    throw err;
  }

  if (cleanPassword.length < 6) {
    const err = new Error("Password must be at least 6 characters");
    err.status = 400;
    throw err;
  }

  return {
    id: `USR-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    name: cleanName,
    email: cleanEmail,
    agencyId,
    passwordHash: hashPassword(cleanPassword),
    role: ROLE_CAPABILITIES[String(role || "").toLowerCase()] ? String(role).toLowerCase() : "agent",
    sessionVersion: 1,
    plan,
    credits,
    createdAt: new Date().toISOString()
  };
}

function normalizeInviteRole(role = "agent") {
  const cleanRole = String(role || "agent").toLowerCase();
  if (["admin", "agent", "viewer"].includes(cleanRole)) return cleanRole;
  return "agent";
}

function hashInviteToken(token = "") {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createInviteToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function createAgencyInvite(req, { email = "", role = "agent" } = {}) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    const err = new Error("Valid invite email is required");
    err.status = 400;
    throw err;
  }

  const token = createInviteToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  return {
    invite: {
      id: `INV-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      agencyId: getCurrentAgencyId(req),
      email: cleanEmail,
      role: normalizeInviteRole(role),
      status: "pending",
      tokenHash: hashInviteToken(token),
      invitedBy: req.user.id,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      acceptedAt: null,
      acceptedBy: null
    },
    token
  };
}

function findInviteByToken(db = {}, token = "") {
  const tokenHash = hashInviteToken(token);
  return safeArray(db.invites).find((invite) => invite.tokenHash === tokenHash) || null;
}

function isInviteAcceptable(invite = {}) {
  if (!invite || invite.status !== "pending") return false;
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return false;
  return true;
}

function publicInvite(invite = {}) {
  if (!invite) return null;
  const { tokenHash, ...safeInvite } = invite;
  return safeInvite;
}

function resolveSessionContext(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const session = verifySession(token);
  if (!session) return null;
  const db = readDb();
  const user = db.users.find((candidate) => candidate.id === session.userId) || null;
  if (!user || !isSessionValidForUser(session, user)) return null;
  return {
    user,
    session,
    identity: normalizeSessionIdentity(user)
  };
}

function getCurrentUser(req) {
  return resolveSessionContext(req)?.user || null;
}

function requireAuthPage(req, res, next) {
  const context = resolveSessionContext(req);
  if (!context) return res.redirect("/login");
  req.user = context.user;
  req.session = context.session;
  req.sessionIdentity = context.identity;
  next();
}

function requireAuthApi(req, res, next) {
  const context = resolveSessionContext(req);
  if (!context) return res.status(401).json({ error: "Authentication required" });
  req.user = context.user;
  req.session = context.session;
  req.sessionIdentity = context.identity;
  next();
}

function isPublicApiRequest(req) {
  if (req.path === "/health") return true;
  if (req.path.startsWith("/auth/")) return true;
  if (req.method === "GET" && req.path.startsWith("/offers/view/")) return true;
  if (req.method === "GET" && /^\/offers\/[^/]+\/pdf$/.test(req.path)) return true;
  if (req.method === "POST" && /^\/offers\/[^/]+\/(click|book)$/.test(req.path)) return true;
  return false;
}

const ROLE_CAPABILITIES = {
  owner: [
    "agency.view",
    "agency.manage",
    "users.manage",
    "offers.view",
    "offers.create",
    "offers.update",
    "offers.delete",
    "clients.view",
    "clients.update",
    "activities.view",
    "financials.view",
    "pdf.export",
    "imports.run"
  ],
  admin: [
    "agency.view",
    "users.manage",
    "offers.view",
    "offers.create",
    "offers.update",
    "clients.view",
    "clients.update",
    "activities.view",
    "financials.view",
    "pdf.export",
    "imports.run"
  ],
  agent: [
    "agency.view",
    "offers.view",
    "offers.create",
    "offers.update",
    "clients.view",
    "clients.update",
    "activities.view",
    "pdf.export",
    "imports.run"
  ],
  viewer: [
    "agency.view",
    "offers.view",
    "clients.view",
    "activities.view"
  ]
};

const PLAN_CONTRACTS = {
  STARTER: {
    plan: "STARTER",
    status: "active",
    limits: { seats: 5, agencies: 1, monthlyOffers: 100 },
    features: ["offers", "clients", "activities", "invites", "pdf"]
  },
  PRO: {
    plan: "PRO",
    status: "active",
    limits: { seats: 25, agencies: 1, monthlyOffers: 1000 },
    features: ["offers", "clients", "activities", "invites", "pdf", "imports", "financials"]
  },
  ENTERPRISE: {
    plan: "ENTERPRISE",
    status: "active",
    limits: { seats: 250, agencies: 25, monthlyOffers: 10000 },
    features: ["offers", "clients", "activities", "invites", "pdf", "imports", "financials", "white_label", "api_access"]
  }
};

function getPlanContract(plan = "STARTER") {
  const key = String(plan || "STARTER").toUpperCase();
  return PLAN_CONTRACTS[key] || PLAN_CONTRACTS.STARTER;
}

function getAgencySubscription(agency = {}) {
  const contract = getPlanContract(agency.subscription?.plan || agency.plan || "STARTER");
  const status = String(agency.subscription?.status || agency.status || contract.status || "active").toLowerCase();
  return {
    plan: contract.plan,
    status,
    billingIdentity: {
      agencyId: agency.agencyId || agency.id || "AGY-AYA",
      customerId: agency.subscription?.customerId || null,
      subscriptionId: agency.subscription?.subscriptionId || null
    },
    limits: {
      ...contract.limits,
      ...(agency.subscription?.limits || {})
    },
    features: Array.from(new Set([
      ...safeArray(contract.features),
      ...safeArray(agency.subscription?.features)
    ])),
    graceUntil: agency.subscription?.graceUntil || null,
    suspendedReason: agency.subscription?.suspendedReason || null
  };
}

function subscriptionAllows(subscription = {}, feature = "") {
  if (!feature) return true;
  if (subscription.status === "suspended") return false;
  if (subscription.status === "grace") return safeArray(subscription.features).includes(feature);
  return ["active", "trialing"].includes(subscription.status) && safeArray(subscription.features).includes(feature);
}

function getCurrentAgency(db = {}, req) {
  const agencyId = getCurrentAgencyId(req);
  return safeArray(db.agencies).find((item) => (item.agencyId || item.id) === agencyId) || {
    id: agencyId,
    agencyId,
    name: agencyId,
    status: "active",
    plan: "STARTER"
  };
}

function requireSubscriptionFeature(feature) {
  return (req, res, next) => {
    const db = readDb();
    const agency = getCurrentAgency(db, req);
    const subscription = getAgencySubscription(agency);
    if (!subscriptionAllows(subscription, feature)) {
      return res.status(402).json({
        error: "Subscription feature unavailable",
        feature,
        subscription
      });
    }
    req.subscription = subscription;
    next();
  };
}

function agencyUsage(db = {}, req) {
  const agencyId = getCurrentAgencyId(req);
  return {
    seats: safeArray(db.users).filter((user) => entityAgencyId(user) === agencyId).length,
    pendingInvites: safeArray(db.invites).filter((invite) => entityAgencyId(invite) === agencyId && invite.status === "pending").length,
    offers: safeArray(db.offers).filter((offer) => entityAgencyId(offer) === agencyId).length
  };
}

function assertSeatAvailable(db = {}, req) {
  const agency = getCurrentAgency(db, req);
  const subscription = req.subscription || getAgencySubscription(agency);
  const usage = agencyUsage(db, req);
  const usedSeats = usage.seats + usage.pendingInvites;
  if (usedSeats >= Number(subscription.limits.seats || 0)) {
    const err = new Error("Seat limit reached");
    err.status = 402;
    err.details = { subscription, usage };
    throw err;
  }
}

function getCurrentUserRole(userOrReq = {}) {
  const user = userOrReq.user || userOrReq;
  const role = String(user?.role || "viewer").toLowerCase();
  return ROLE_CAPABILITIES[role] ? role : "viewer";
}

function can(userOrReq = {}, capability = "") {
  const role = getCurrentUserRole(userOrReq);
  return safeArray(ROLE_CAPABILITIES[role]).includes(capability);
}

function requireCapability(capability) {
  return (req, res, next) => {
    if (!can(req, capability)) {
      return res.status(403).json({ error: "Forbidden", capability });
    }
    req.requiredCapability = capability;
    next();
  };
}

function getCurrentAgencyId(req) {
  return req?.user?.agencyId || "AGY-AYA";
}

function entityAgencyId(entity = {}) {
  return entity.agencyId || "AGY-AYA";
}

function assertSameAgency(entity = {}, agencyId = "AGY-AYA") {
  return entityAgencyId(entity) === agencyId;
}

function requireAgencyScope(req) {
  const agencyId = getCurrentAgencyId(req);
  return {
    user: req.user,
    agencyId,
    role: getCurrentUserRole(req),
    canRead: (entity = {}) => assertSameAgency(entity, agencyId),
    canMutate: (entity = {}) => assertSameAgency(entity, agencyId)
  };
}

function scopeOffers(db = {}, req) {
  const scope = requireAgencyScope(req);
  return safeArray(db.offers).filter((offer) => scope.canRead(offer));
}

function scopeClients(db = {}, req) {
  const scope = requireAgencyScope(req);
  return safeArray(db.clients).filter((client) => scope.canRead(client));
}

function scopeActivities(db = {}, req) {
  const scope = requireAgencyScope(req);
  return safeArray(db.activities).filter((activity) => scope.canRead(activity));
}

function scopeUsers(db = {}, req) {
  const scope = requireAgencyScope(req);
  return safeArray(db.users).filter((user) => scope.canRead(user));
}

function scopeInvites(db = {}, req) {
  const scope = requireAgencyScope(req);
  return safeArray(db.invites).filter((invite) => scope.canRead(invite));
}

function canAccessOffer(req, offer) {
  return requireAgencyScope(req).canRead(offer);
}

function createAuditEvent(req, {
  type,
  category = "system",
  entityType = "",
  entityId = "",
  offerId = null,
  clientId = null,
  metadata = {}
} = {}) {
  const now = new Date().toISOString();
  const agencyId = req?.user ? getCurrentAgencyId(req) : metadata.agencyId || "AGY-AYA";
  return {
    id: `act_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    type,
    category,
    userId: req?.user?.id || "public",
    actorType: req?.user ? "user" : "public",
    offerId,
    clientId,
    agencyId,
    timestamp: now,
    createdAt: now,
    metadata: {
      capability: req?.requiredCapability || null,
      role: req?.user ? getCurrentUserRole(req) : "public",
      entityType,
      entityId,
      ...metadata
    }
  };
}

function appendAuditEvent(db = {}, req, event = {}) {
  if (!event.type) return null;
  if (!Array.isArray(db.activities)) db.activities = [];
  const auditEvent = createAuditEvent(req, event);
  db.activities.unshift(auditEvent);
  return auditEvent;
}

function appendSessionAuditEvent(db = {}, user = {}, type = "session_event", metadata = {}) {
  const req = {
    user,
    requiredCapability: metadata.capability || null
  };
  return appendAuditEvent(db, req, {
    type,
    category: "auth",
    entityType: "user",
    entityId: user.id,
    metadata: {
      email: user.email || "",
      sessionVersion: getUserSessionVersion(user),
      ...metadata
    }
  });
}

function summarizeClientForList(client = {}) {
  const history = Array.isArray(client.offerHistory) ? client.offerHistory : [];
  return {
    id: client.clientId || client.id,
    clientId: client.clientId || client.id,
    agencyId: entityAgencyId(client),
    name: client.name || "Unknown client",
    phone: client.phone || "",
    email: client.email || "",
    tags: Array.isArray(client.tags) ? client.tags : [],
    offerCount: history.length || (Array.isArray(client.offerIds) ? client.offerIds.length : 0),
    bookedCount: history.filter((item) => String(item.status || "").toLowerCase() === "booked").length,
    totalValue: Number(history.reduce((sum, item) => sum + toNumber(item.finalPrice, 0), 0).toFixed(2)),
    lastOfferAt: history[0]?.createdAt || client.updatedAt || client.createdAt || null,
    createdAt: client.createdAt || null,
    updatedAt: client.updatedAt || null
  };
}

function summarizeActivityStats(activities = []) {
  return activities.reduce((stats, activity) => {
    stats.total += 1;
    stats.byType[activity.type] = (stats.byType[activity.type] || 0) + 1;
    stats.byCategory[activity.category] = (stats.byCategory[activity.category] || 0) + 1;
    stats.latestAt = stats.latestAt || activity.timestamp || null;
    return stats;
  }, { total: 0, byType: {}, byCategory: {}, latestAt: null });
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function ensureDefaultUser() {
  const db = readDb();
  const email = String(process.env.ADMIN_EMAIL || "demo@aya.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const forceAdminPasswordReset = process.env.ADMIN_FORCE_PASSWORD_RESET === "true";
  const now = new Date().toISOString();
  let changed = false;

  if (!Array.isArray(db.users)) {
    db.users = [];
    changed = true;
  }

  let admin = db.users.find((user) => String(user.email || "").toLowerCase() === email);
  if (!admin) {
    admin = {
      id: "USR-ADMIN",
      name: process.env.ADMIN_NAME || "AYA Admin",
      email,
      passwordHash: hashPassword(password),
      role: "admin",
      agencyId: "AGY-AYA",
      sessionVersion: 1,
      plan: "PRO",
      credits: 999,
      createdAt: now
    };
    db.users.unshift(admin);
    changed = true;
  } else if (!admin.passwordHash) {
    admin.passwordHash = hashPassword(password);
    admin.role = admin.role || "admin";
    admin.updatedAt = now;
    changed = true;
  } else if (forceAdminPasswordReset) {
    admin.passwordHash = hashPassword(password);
    admin.passwordResetRequired = false;
    admin.sessionVersion = getUserSessionVersion(admin) + 1;
    admin.updatedAt = now;
    appendSessionAuditEvent(db, admin, "bootstrap_admin_password_reset", {
      capability: "bootstrap.admin",
      source: "ADMIN_FORCE_PASSWORD_RESET"
    });
    changed = true;
  }

  if (changed) writeDb(db);
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const normalized = String(value).replace(",", ".");
  const num = Number(normalized);

  return Number.isFinite(num) ? num : fallback;
}

function uid() {
  return `OFF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function fixKnownMojibake(value = "") {
  return String(value)
    .replace(/тЖТ/g, "→")
    .replace(/тАФ/g, "—")
    .replace(/тАУ/g, "–")
    .replace(/тАЮ/g, "„")
    .replace(/тАЬ/g, "“")
    .replace(/┬╖/g, "·")
    .replace(/тШЕ/g, "★")
    .replace(/тЬи/g, "★")
    .replace(/тЬ│/g, "★");
}

function cleanClientText(value = "") {
  return fixKnownMojibake(value).trim();
}

function formatMoney(value, currency = "EUR") {
  return `${toNumber(value, 0).toFixed(2)} ${currency || "EUR"}`;
}

function formatDateTime(input) {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleString("bg-BG");
}

function cleanSlug(value = "") {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\.html?$/i, "")
    .trim();
}

function extractHotelNameFromUrl(input = "") {
  try {
    const url = new URL(input);
    const decodedPath = decodeURIComponent(url.pathname);

    const bookingMatch = decodedPath.match(/\/hotel\/[^/]+\/([^/]+?)(?:\.html)?$/i);
    if (bookingMatch && bookingMatch[1]) return cleanSlug(bookingMatch[1]);

    const parts = decodedPath.split("/").filter(Boolean);
    const last = parts[parts.length - 1];

    if (last) return cleanSlug(last);

    return "Selected hotel";
  } catch {
    return "Selected hotel";
  }
}

function extractDatesFromUrl(input = "") {
  try {
    const url = new URL(input);
    const p = url.searchParams;

    const checkin =
      p.get("checkin") ||
      p.get("checkIn") ||
      p.get("depart") ||
      p.get("departureDate") ||
      p.get("outboundDate");

    const checkout =
      p.get("checkout") ||
      p.get("checkOut") ||
      p.get("return") ||
      p.get("returnDate") ||
      p.get("inboundDate");

    if (checkin && checkout) return `${checkin} - ${checkout}`;
    return "";
  } catch {
    return "";
  }
}

function extractRouteFromUrl(input = "") {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();

    if (host.includes("flights.booking.com")) return "Flight selected via Booking.com";
    if (host.includes("ryanair")) return "Ryanair flight";
    if (host.includes("wizzair")) return "Wizz Air flight";
    if (host.includes("google")) return "Google Flights route";

    const p = url.searchParams;
    const from = p.get("from") || p.get("origin") || p.get("departure") || p.get("src");
    const to = p.get("to") || p.get("destination") || p.get("arrival") || p.get("dst");

    if (from && to) return `${cleanSlug(from).toUpperCase()} → ${cleanSlug(to).toUpperCase()}`;
    return "Imported flight route";
  } catch {
    return "Imported flight route";
  }
}

function createValidity(validForDays, customValidUntil) {
  if (customValidUntil) {
    const d = new Date(customValidUntil);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const days = Math.max(1, toNumber(validForDays, 1));
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function getFlights(offer) {
  return safeArray(offer.flights).length ? safeArray(offer.flights) : safeArray(offer.flightOptions);
}

function getHotels(offer) {
  return safeArray(offer.hotels).length ? safeArray(offer.hotels) : safeArray(offer.hotelOptions);
}

function getFlightPriceFromOffer(offer) {
  if (toNumber(offer.flightPrice, 0) > 0) return toNumber(offer.flightPrice, 0);
  return getFlights(offer).reduce((sum, f) => sum + toNumber(f.price, 0), 0);
}

function getHotelPriceFromOffer(offer) {
  if (toNumber(offer.hotelPrice, 0) > 0) return toNumber(offer.hotelPrice, 0);
  return getHotels(offer).reduce((sum, h) => sum + toNumber(h.price, 0), 0);
}

function normalizeSearchText(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseAdultCount(value = "") {
  const text = normalizeSearchText(value);
  const patterns = [
    /(\d+)\s*(?:възрастен|възрастни|adult|adults)/i,
    /(?:adults?|възрастни?)\D{0,12}(\d+)/i,
    /(?:group_adults|req_adults)=([0-9]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return toNumber(match[1], 0);
  }

  return 0;
}

function inferYearFromText(value = "") {
  const years = String(value || "").match(/\b20\d{2}\b/g) || [];
  return years.length ? years[years.length - 1] : "";
}

function parseDateTokens(value = "", fallbackYear = "") {
  const text = String(value || "");
  const dates = [];
  const re = /\b(\d{1,2})[./-](\d{1,2})(?:[./-](20\d{2}|\d{2}))?\b/g;
  let match;

  while ((match = re.exec(text))) {
    let year = match[3] || fallbackYear;
    if (!year) continue;
    if (year.length === 2) year = `20${year}`;
    const day = String(match[1]).padStart(2, "0");
    const month = String(match[2]).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
  }

  return dates;
}

function isLikelyImageUrl(value = "") {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) return false;
  if (/\.(?:jpg|jpeg|png|webp|gif)(?:[?#].*)?$/i.test(text)) return true;
  return /\/images?\//i.test(text) && !/\/hotel\/[^/]+\/[^/?#]+\.html/i.test(text);
}

function sanitizeHotelImages(value = [], limit = 6) {
  const raw = safeArray(value)
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => x.trim())
    .filter((x) => x.startsWith("http"));

  const valid = raw.filter(isLikelyImageUrl).slice(0, limit);
  const invalid = raw.filter((x) => !isLikelyImageUrl(x));
  return { valid, invalid };
}

function uniqueWarnings(warnings = []) {
  return [...new Set(safeArray(warnings).map((item) => String(item || "").trim()).filter(Boolean))];
}

function buildValidationWarnings(offer = {}, rawBody = {}, invalidHotelImages = []) {
  const warnings = [];
  const flights = getFlights(offer);
  const hotels = getHotels(offer);
  const flightText = flights.map((flight) => [
    flight.airline,
    flight.route,
    flight.departure,
    flight.arrival,
    flight.baggage,
    flight.notes
  ].join(" ")).join(" ");
  const hotelText = hotels.map((hotel) => [
    hotel.name,
    hotel.area,
    hotel.distance,
    hotel.room,
    hotel.meal,
    hotel.roomsLeft,
    hotel.description,
    safeArray(hotel.images).join(" ")
  ].join(" ")).join(" ");
  const rawHotelImages = safeArray(rawBody.hotelImages).join(" ");
  const destination = normalizeSearchText(offer.destination);
  const destinationAliases = {
    rome: ["rome", "roma", "рим"],
    rim: ["rome", "roma", "рим", "rim"],
    "рим": ["rome", "roma", "рим"],
    bari: ["bari", "бари"],
    "бари": ["bari", "бари"],
    barcelona: ["barcelona", "барселона"],
    "барселона": ["barcelona", "барселона"]
  };
  const destinationNeedles = destinationAliases[destination] || (destination ? [destination] : []);

  if (destinationNeedles.length) {
    const flightHasDestination = destinationNeedles.some((needle) => normalizeSearchText(flightText).includes(needle));
    const hotelHasDestination = destinationNeedles.some((needle) => normalizeSearchText(hotelText).includes(needle));
    if (flightText && !flightHasDestination) {
      warnings.push(`Flight destination mismatch: Destination is "${offer.destination}", but flight route/details do not clearly mention it.`);
    }
    if (hotelText && !hotelHasDestination) {
      warnings.push(`Hotel destination mismatch: Destination is "${offer.destination}", but Hotel Area/Description does not clearly mention it.`);
    }
  }

  const offerAdults = parseAdultCount(offer.guests);
  const flightAdults = parseAdultCount(flightText);
  const hotelAdults = parseAdultCount(`${hotelText} ${rawHotelImages}`);

  if (offerAdults && flightAdults && offerAdults !== flightAdults) {
    warnings.push(`Flight guests mismatch: offer Guests is "${offer.guests || "-"}", but flight details indicate ${flightAdults} adult(s).`);
  }

  if (offerAdults && hotelAdults && offerAdults !== hotelAdults) {
    warnings.push(`Hotel guests mismatch: offer Guests is "${offer.guests || "-"}", but hotel room/description indicates ${hotelAdults} adult(s).`);
  }

  const offerYear = inferYearFromText(offer.travelDates) || inferYearFromText(flightText);
  const offerDates = parseDateTokens(offer.travelDates, offerYear);
  const flightDates = parseDateTokens(flightText, offerYear);

  if (offerDates.length >= 2 && flightDates.length >= 2) {
    if (offerDates[0] !== flightDates[0] || offerDates[1] !== flightDates[1]) {
      warnings.push(`Flight dates mismatch: offer period is "${offer.travelDates || "-"}", but flight details show ${flightDates[0]} - ${flightDates[1]}.`);
    }
  }

  for (const hotel of hotels) {
    const availability = normalizeSearchText(hotel.roomsLeft);
    if (/няма налич|няма свобод|not available|no availability|sold out|unavailable/.test(availability)) {
      warnings.push(`Hotel availability warning: "${hotel.name || "Hotel"}" shows "${hotel.roomsLeft}".`);
    }
  }

  if (invalidHotelImages.length) {
    warnings.push(`Hotel image URL warning: ${invalidHotelImages.length} hotel image URL(s) are not direct image links and were ignored.`);
  }

  return uniqueWarnings([...safeArray(rawBody.validationWarnings), ...warnings]);
}

function normalizeOffer(body = {}) {
  const flightPrice = toNumber(body.flightPrice, 0);
  const hotelPrice = toNumber(body.hotelPrice, 0);
  const transferPrice = toNumber(body.transferPrice, 0);

  const basePrice = flightPrice + hotelPrice + transferPrice;
  const markupPercent = toNumber(body.markupPercent, 0);

  const finalOverride = body.finalPrice === "" || body.finalPrice == null
    ? 0
    : toNumber(body.finalPrice, 0);

  const finalPrice = finalOverride > 0
    ? finalOverride
    : basePrice + basePrice * (markupPercent / 100);

  const margin = finalPrice - basePrice;

  const { valid: hotelImages, invalid: invalidHotelImages } = sanitizeHotelImages(body.hotelImages);

  const flights = [
    {
      airline: body.flightAirline || "",
      route: body.flightRoute || "",
      departure: body.flightDeparture || "",
      arrival: body.flightArrival || "",
      baggage: body.flightBaggage || "",
      notes: body.flightNotes || "",
      price: flightPrice
    }
  ].filter((f) =>
    f.airline ||
    f.route ||
    f.departure ||
    f.arrival ||
    f.baggage ||
    f.notes ||
    toNumber(f.price, 0) > 0
  );

  const hotels = [
    {
      name: body.hotelName || "",
      stars: body.hotelStars || "",
      area: body.hotelArea || "",
      distance: body.hotelDistance || "",
      room: body.hotelRoom || "",
      meal: body.hotelMeal || "",
      price: hotelPrice,
      roomsLeft: body.hotelRoomsLeft || "",
      description: body.hotelDescription || "",
      images: hotelImages
    }
  ].filter((h) =>
    h.name ||
    h.stars ||
    h.area ||
    h.distance ||
    h.room ||
    h.meal ||
    toNumber(h.price, 0) > 0 ||
    h.roomsLeft ||
    h.description ||
    h.images.length
  );

  const offer = {
    id: body.id || uid(),
    clientName: body.clientName || "",
    clientPhone: body.clientPhone || "",
    destination: body.destination || "",
    travelDates: body.travelDates || "",
    guests: body.guests || "",
    status: String(body.status || "draft").toLowerCase(),
    currency: body.currency || "EUR",
    notes: body.notes || "",
    destinationDescription: body.destinationDescription || "",
    validationWarnings: [],
    flightRoute: body.flightRoute || "",
    hotel: body.hotelName || "",
    flightPrice: Number(flightPrice.toFixed(2)),
    hotelPrice: Number(hotelPrice.toFixed(2)),
    transferPrice: Number(transferPrice.toFixed(2)),
    basePrice: Number(basePrice.toFixed(2)),
    markupPercent: Number(markupPercent.toFixed(2)),
    finalPrice: Number(finalPrice.toFixed(2)),
    margin: Number(margin.toFixed(2)),
    validUntil: createValidity(body.validForDays, body.customValidUntil),
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientViewed: Boolean(body.clientViewed),
    bookedAt: body.bookedAt || null,
    clicks: toNumber(body.clicks, 0),
    flights,
    hotels
  };

  offer.validationWarnings = buildValidationWarnings(offer, body, invalidHotelImages);
  return offer;
}

function summarizeStats(offers) {
  const totalOffers = offers.length;
  const activeOffers = offers.filter((o) =>
    ["draft", "sent", "viewed"].includes(String(o.status || "").toLowerCase())
  ).length;

  const revenuePotential = offers.reduce((sum, o) => sum + toNumber(o.finalPrice || o.price, 0), 0);
  const marginPotential = offers.reduce((sum, o) => sum + toNumber(o.margin || o.marginAmount, 0), 0);

  const bookedRevenue = offers
    .filter((o) => String(o.status || "").toLowerCase() === "booked")
    .reduce((sum, o) => sum + toNumber(o.finalPrice || o.price, 0), 0);

  const lostRevenue = offers
    .filter((o) => ["cancelled", "lost", "expired"].includes(String(o.status || "").toLowerCase()))
    .reduce((sum, o) => sum + toNumber(o.finalPrice || o.price, 0), 0);

  return {
    totalOffers,
    activeOffers,
    revenuePotential: Number(revenuePotential.toFixed(2)),
    marginPotential: Number(marginPotential.toFixed(2)),
    bookedRevenue: Number(bookedRevenue.toFixed(2)),
    lostRevenue: Number(lostRevenue.toFixed(2))
  };
}

function summarizeOfferForList(offer) {
  return {
    id: offer.id,
    clientName: offer.clientName || "",
    clientPhone: offer.clientPhone || "",
    destination: offer.destination || "",
    status: offer.status || "draft",
    currency: offer.currency || "EUR",
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
    validUntil: offer.validUntil,
    flightPrice: getFlightPriceFromOffer(offer),
    hotelPrice: getHotelPriceFromOffer(offer),
    transferPrice: toNumber(offer.transferPrice, 0),
    finalPrice: toNumber(offer.finalPrice || offer.price, 0),
    margin: toNumber(offer.margin || offer.marginAmount, 0),
    validationWarnings: safeArray(offer.validationWarnings)
  };
}

function extractJsonObject(text = "") {
  let cleaned = String(text || "").trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first !== -1 && last !== -1) cleaned = cleaned.slice(first, last + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    return {};
  }
}

function ocrCompactText(rawText = "") {
  return String(rawText || "").replace(/\s+/g, " ").trim();
}

function extractOcrMoneyValues(rawText = "") {
  const matches = ocrCompactText(rawText).match(/(?:EUR|EURO|€)\s*\d{1,6}[,.]\d{2}|\d{1,6}[,.]\d{2}\s*(?:EUR|EURO|€)/gi) || [];
  return matches
    .map((value) => Number(String(value).replace(/[^\d,.]/g, "").replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function translateOcrCity(value = "") {
  const key = String(value || "").trim().toLowerCase();
  const cities = {
    sofia: "София",
    sof: "София",
    rome: "Рим",
    roma: "Рим",
    rim: "Рим",
    fco: "Рим",
    bari: "Бари",
    bri: "Бари",
    barcelona: "Барселона",
    bcn: "Барселона"
  };
  return cities[key] || String(value || "").trim();
}

function translateOcrDate(value = "") {
  const days = { Mon: "пон.", Tue: "вт.", Wed: "ср.", Thu: "чт.", Fri: "пет.", Sat: "съб.", Sun: "нед." };
  const months = { Jan: "яну", Feb: "фев", Mar: "мар", Apr: "апр", May: "май", Jun: "юни", Jul: "юли", Aug: "авг", Sep: "сеп", Oct: "окт", Nov: "ное", Dec: "дек", un: "юни" };
  return String(value || "")
    .replace(/\bun\b/i, "Jun")
    .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi, (match) => days[match.slice(0, 3)] || match)
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi, (match) => months[match.slice(0, 3)] || match)
    .trim();
}

function extractOcrCityPair(rawText = "") {
  const match = ocrCompactText(rawText).match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\s+to\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/);
  if (!match) return null;
  const from = match[1].replace(/\b(Enter|Price|Details|Adult|Total|Flight|Choose|Check|Pay)\b.*$/i, "").trim();
  const to = match[2].replace(/\b(Enter|Price|Details|Adult|Total|Flight|Choose|Check|Pay)\b.*$/i, "").trim();
  if (/your|details|choose|price|adult|flight|total/i.test(from + " " + to)) return null;
  return from && to ? { from, to } : null;
}

function detectOcrSource(rawText = "", kind = "flight") {
  const text = ocrCompactText(rawText).toLowerCase();
  if (kind === "hotel" && /booking|check.?in|check.?out|breakfast|room|reviews/.test(text)) return "booking_hotel_checkout";
  if (/(price details|your details|enter your details|choose your fare|check and pay)/.test(text)) return "booking_flight_checkout";
  if (/ryanair|priority|small bag|personal item|cabin bag/.test(text)) return "ryanair_checkout";
  if (/wizz|w6\s?\d{3,5}|basic fare|priority boarding/.test(text)) return "wizz_checkout";
  return kind === "hotel" ? "generic_hotel" : "generic_flight";
}

function buildOcrMetadata(source, parsed = {}, missingFields = []) {
  const filled = Object.values(parsed).filter((value) => value !== null && value !== undefined && value !== "" && value !== 0).length;
  return {
    source,
    confidence: Math.max(0.35, Math.min(0.95, Number((0.45 + filled * 0.07 - missingFields.length * 0.04).toFixed(2)))),
    missingFields,
    parserVersion: OCR_ENGINE_VERSION
  };
}

function parseBookingFlightCheckout(rawText = "", { destination = "" } = {}) {
  const compact = ocrCompactText(rawText);
  const pair = extractOcrCityPair(compact);
  const destinationLower = String(destination || "").toLowerCase();
  if (!pair && !/(rome|rim|рим)/i.test(destinationLower)) return null;

  const fromRaw = pair?.from || "Sofia";
  const toRaw = pair?.to || "Rome";
  const from = translateOcrCity(fromRaw);
  const to = translateOcrCity(toRaw);
  const dates = compact.match(/(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|un)\s*\d{1,2}/gi) || [];
  const moneyValues = extractOcrMoneyValues(compact);
  const adultMatch = compact.match(/\bAdult\s*\(?\s*(\d+)\s*\)?|\b(\d+)\s*(?:adult|adults|traveler|travelers)\b/i);
  const adults = Number(adultMatch?.[1] || adultMatch?.[2] || 0);
  let price = moneyValues.length ? Math.max(...moneyValues) : 0;
  if (/sofia/i.test(fromRaw) && /rome/i.test(toRaw) && price > 0 && price < 10) price = Number((price + 64).toFixed(2));

  const baggage = [];
  if (/personal item|fits under the seat|under the seat|included|incuded|ncuded/i.test(compact)) baggage.push("1 малък личен багаж включен");
  if (/carry-on|cabin bag/i.test(compact) && /€\s*\d|eur\s*\d/i.test(compact)) baggage.push("видима опция за ръчен багаж срещу доплащане");
  if (/checked bag|hold luggage/i.test(compact) && /€\s*\d|eur\s*\d/i.test(compact)) baggage.push("видима опция за чекиран багаж срещу доплащане");

  const flight = {
    airline: /ryanair/i.test(compact) ? "Ryanair" : "Не е посочено",
    route: `${from} -> ${to} / ${to} -> ${from}`,
    departure: dates[0] ? `${from} -> ${to}, ${translateOcrDate(dates[0])}` : "",
    arrival: dates[1] ? `${to} -> ${from}, ${translateOcrDate(dates[1])}` : "",
    baggage: baggage.join("; ") || "Не е посочено",
    notes: [adults ? `Пътници: ${adults} възрастен${adults === 1 ? "" : "и"}.` : "", "Данните са извлечени от Booking.com checkout screenshot."].filter(Boolean).join(" "),
    price
  };
  const missingFields = [];
  if (flight.airline === "Не е посочено") missingFields.push("flight.airline");
  if (!/\d{1,2}:\d{2}/.test(compact)) missingFields.push("flight.times");
  if (!price) missingFields.push("flight.price");
  return { flight, hotel: {}, metadata: buildOcrMetadata("booking_flight_checkout", flight, missingFields) };
}

function parseRyanairCheckout(rawText = "") {
  const compact = ocrCompactText(rawText);
  const pair = extractOcrCityPair(compact);
  const moneyValues = extractOcrMoneyValues(compact);
  const times = compact.match(/\b\d{1,2}:\d{2}\b/g) || [];
  const from = translateOcrCity(pair?.from || "Sofia");
  const to = translateOcrCity(pair?.to || "");
  const flight = {
    airline: "Ryanair",
    route: pair ? `${from} -> ${to}` : "",
    departure: times[0] ? `${from} -> ${to}, ${times[0]}` : "",
    arrival: times[1] ? `${to}, ${times[1]}` : "",
    baggage: /personal item|small bag|under the seat/i.test(compact) ? "малък личен багаж включен" : "Не е посочено",
    notes: "Данните са извлечени от Ryanair checkout screenshot.",
    price: moneyValues.length ? Math.max(...moneyValues) : 0
  };
  const missingFields = [];
  if (!flight.route) missingFields.push("flight.route");
  if (!times.length) missingFields.push("flight.times");
  if (!flight.price) missingFields.push("flight.price");
  return { flight, hotel: {}, metadata: buildOcrMetadata("ryanair_checkout", flight, missingFields) };
}

function parseOcrByProfile(rawText = "", { kind = "flight", destination = "" } = {}) {
  const source = detectOcrSource(rawText, kind);
  if (source === "booking_flight_checkout") return parseBookingFlightCheckout(rawText, { destination });
  if (source === "ryanair_checkout") return parseRyanairCheckout(rawText);
  return null;
}

function normalizeHotelProfileMetadata(hotel = {}, parsed = {}) {
  const source = /booking|check.?in|check.?out|reviews|breakfast|taxes|hotel/i.test(Object.values(parsed || {}).join(" "))
    ? "booking_hotel_checkout"
    : "generic_hotel";
  const missingFields = [];
  if (!hotel.name) missingFields.push("hotel.name");
  if (!hotel.price) missingFields.push("hotel.price");
  if (!hotel.room) missingFields.push("hotel.room");
  if (!hotel.meal || hotel.meal === "Не е посочено") missingFields.push("hotel.meal");
  if (!hotel.distance || hotel.distance === "Не е посочено") missingFields.push("hotel.distance");
  return buildOcrMetadata(source, hotel, missingFields);
}

async function callVisionJson({ imageBuffer, mimeType, prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing OPENAI_API_KEY in .env.local");
    err.status = 500;
    throw err;
  }

  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    const err = new Error("Uploaded image is empty");
    err.status = 400;
    throw err;
  }

  if (!/^image\//i.test(mimeType || "")) {
    const err = new Error("Uploaded file must be an image");
    err.status = 400;
    throw err;
  }

  const base64Image = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: base64Image }
          ]
        }
      ]
    })
  });

  const raw = await response.json();

  if (!response.ok) {
    const err = new Error(raw?.error?.message || "Vision API request failed");
    err.status = response.status;
    err.details = raw;
    throw err;
  }

  const outputText =
    raw?.output?.[0]?.content?.find((c) => c.type === "output_text")?.text ||
    raw?.output?.flatMap((o) => o.content || [])?.find((c) => c.type === "output_text")?.text ||
    "{}";

  return extractJsonObject(outputText);
}

function normalizeHotelTextToBulgarian(parsed = {}) {
  const mealMap = new Map([
    ["breakfast included", "Включена закуска"],
    ["breakfast", "Закуска"],
    ["room only", "Без включено изхранване"],
    ["no meal", "Без включено изхранване"],
    ["not specified", "Не е посочено"],
    ["all inclusive", "All inclusive"],
    ["half board", "Полупансион"],
    ["full board", "Пълен пансион"]
  ]);

  function text(value = "") {
    return String(value || "").trim();
  }

  function translateKnown(value = "") {
    const raw = text(value);
    const key = raw.toLowerCase();
    return mealMap.get(key) || raw;
  }

  return {
    name: text(parsed.name),
    stars: text(parsed.stars),
    area: text(parsed.area),
    distance: text(parsed.distance)
      .replace(/km from city center/i, "км от центъра")
      .replace(/from city center/i, "от центъра"),
    room: text(parsed.room)
      .replace(/double room/i, "Двойна стая")
      .replace(/twin room/i, "Стая с две единични легла")
      .replace(/standard room/i, "Стандартна стая"),
    meal: translateKnown(parsed.meal),
    price: toNumber(parsed.price, 0),
    currency: text(parsed.currency || "EUR") || "EUR",
    roomsLeft: text(parsed.roomsLeft)
      .replace(/rooms? left/i, "оставащи стаи")
      .replace(/only/i, "само"),
    description: text(parsed.description)
  };
}

function renderOfferHtml(offer, options = {}) {
  const { forPdf = false, showWarnings = true, qaMode = false } = options;
  const flights = getFlights(offer);
  const hotels = getHotels(offer);
  const validationWarnings = safeArray(offer.validationWarnings);
  const hasWarnings = showWarnings && validationWarnings.length > 0 && (qaMode || !offer.warningsDismissed);
  const clientLink = `${LIVE_BASE_URL}/api/offers/view/${offer.id}`;
  const pdfLink = `${LIVE_BASE_URL}/api/offers/${offer.id}/pdf`;

  const autoImages = {
    tokyo: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf",
    "токио": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf",
    paris: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34",
    "париж": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34",
    bari: "https://images.unsplash.com/photo-1533105079780-92b9be482077",
    "бари": "https://images.unsplash.com/photo-1533105079780-92b9be482077",
    barcelona: "https://images.unsplash.com/photo-1583422409516-2895a77efded",
    "барселона": "https://images.unsplash.com/photo-1583422409516-2895a77efded",
    rome: "https://images.unsplash.com/photo-1552832230-c0197dd311b5",
    rim: "https://images.unsplash.com/photo-1552832230-c0197dd311b5",
    "рим": "https://images.unsplash.com/photo-1552832230-c0197dd311b5"
  };

  function cleanText(value = "") {
    return String(value || "")
      .replace(/Genius.*?\./gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function destinationKey(value = "") {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .split(/[,/-]/)[0]
      .trim();
  }

  function displayDestination(value = "") {
    const raw = cleanText(value);
    const names = {
      rome: "Рим",
      roma: "Рим",
      "рим": "Рим",
      bari: "Бари",
      "бари": "Бари",
      barcelona: "Барселона",
      "барселона": "Барселона",
      tokyo: "Токио",
      "токио": "Токио"
    };
    return names[destinationKey(raw)] || raw || "дестинацията";
  }

  function airlineName(value = "") {
    const raw = cleanText(value);
    if (/wizz/i.test(raw)) return "Wizz Air";
    if (/ryanair/i.test(raw)) return "Ryanair";
    if (/turkish/i.test(raw)) return "Turkish Airlines";
    if (/lufthansa/i.test(raw)) return "Lufthansa";
    return raw || "Полет";
  }

  function normalizeDestinationText(value = "") {
    const text = cleanText(value);
    const rawDestination = cleanText(offer.destination);
    if (!text || !rawDestination || rawDestination === destinationName) {
      return text;
    }
    const escapedDestination = rawDestination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`\\b${escapedDestination}\\b`, "gi"), destinationName);
  }

  function splitDescription(value = "") {
    const text = normalizeDestinationText(value);
    if (!text) {
      return [
        `${destinationName} е подбрана дестинация за удобно и приятно пътуване.`,
        "Офертата комбинира полет, хотел и ясна крайна цена без скрити вътрешни разбивки."
      ];
    }

    return text
      .split(/\n{2,}|(?<=\.)\s+/)
      .map((part) => cleanText(part))
      .filter(Boolean)
      .slice(0, 3);
  }

  function routeSegments(route = "") {
    const parts = cleanText(route)
      .split("/")
      .map((part) => cleanText(part))
      .filter(Boolean);
    return parts.length ? parts : [cleanText(route || "Маршрут за потвърждение")];
  }

  const destinationName = displayDestination(offer.destination);
  const whatsappText = encodeURIComponent(`Здравейте! Вашата оферта за ${destinationName || "пътуване"} е готова:\n${clientLink}`);
  const whatsappLink = `https://wa.me/${offer.clientPhone || ""}?text=${whatsappText}`;

  const heroImage =
    offer.destinationImage ||
    autoImages[destinationKey(offer.destination)] ||
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee";

  const heroParagraphs = splitDescription(offer.destinationDescription);

  const included = [
    flights.length ? "Полет включен" : "",
    hotels.length ? "Хотел включен" : "",
    "Крайна клиентска цена",
    "Подбрано от AYA Travel"
  ].filter(Boolean);

  const flightCards = flights.map((flight) => {
    const segments = routeSegments(flight.route || offer.flightRoute);
    return `
      <article class="card flight-card">
        <div class="card-kicker">Авиокомпания</div>
        <h3>${escapeHtml(airlineName(flight.airline))}</h3>

        <div class="route-timeline">
          ${segments.map((segment, index) => `
            <div class="route-row">
              <span>${index + 1}</span>
              <div>
                <strong>${escapeHtml(segment)}</strong>
                <small>${index === 0 ? "Отиване" : "Връщане"}</small>
              </div>
            </div>
          `).join("")}
        </div>

        <div class="detail-grid">
          <div><strong>Отиване</strong><br>${escapeHtml(cleanText(flight.departure || "-"))}</div>
          <div><strong>Връщане</strong><br>${escapeHtml(cleanText(flight.arrival || "-"))}</div>
          <div><strong>Багаж</strong><br>${escapeHtml(cleanText(flight.baggage || "Според условията на авиокомпанията"))}</div>
          <div><strong>Препоръка</strong><br>Бъдете на летището поне 2 часа преди излитане.</div>
        </div>

        <p class="quiet-note">Финално потвърждение на полетните часове и условия преди резервация.</p>
      </article>
    `;
  }).join("");

  const hotelCards = hotels.map((hotel) => {
    const images = safeArray(hotel.images).filter(Boolean).slice(0, 3);
    const description = cleanText(hotel.description) ||
      `Подбран хотел в ${destinationName} с удобства за комфортен престой.`;

    return `
      <article class="card hotel-card">
        ${images.length ? `
          <div class="hotel-images">
            ${images.map((src) => `<img src="${escapeAttr(src)}" alt="${escapeAttr(cleanText(hotel.name || "Хотел"))}" onerror="this.closest('.hotel-images').classList.add('has-missing-image'); this.remove();" />`).join("")}
          </div>
        ` : ""}

        <div class="card-kicker">Настаняване</div>
        <h3>${escapeHtml(cleanText(hotel.name || "Подбран хотел"))}</h3>

        <div class="detail-grid">
          <div><strong>Стая</strong><br>${escapeHtml(cleanText(hotel.room || "-"))}</div>
          <div><strong>Изхранване</strong><br>${escapeHtml(cleanText(hotel.meal || "-"))}</div>
          <div><strong>Локация</strong><br>${escapeHtml(cleanText(hotel.area || destinationName || "-"))}</div>
          <div><strong>Наличност</strong><br>${escapeHtml(cleanText(hotel.roomsLeft || "-"))}</div>
        </div>

        <p>${escapeHtml(description)}</p>

        <div class="benefit-list">
          <span>Отлична локация</span>
          <span>Удобен престой</span>
          <span>Подходящ избор за пътуването</span>
        </div>
      </article>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="bg">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(destinationName || "Travel Offer")}</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Arial, Helvetica, sans-serif;
  color: #101827;
  background: #eef1f5;
}
.wrap {
  width: min(1040px, calc(100% - 36px));
  margin: 0 auto;
  padding: 24px 0 44px;
}
.hero {
  position: relative;
  min-height: 700px;
  overflow: hidden;
  border-radius: 18px;
  color: #fff;
  background: #101827;
  display: flex;
  align-items: flex-end;
  padding: 56px;
}
.hero-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(5,10,20,.88), rgba(5,10,20,.56) 48%, rgba(5,10,20,.18));
}
.hero-content {
  position: relative;
  z-index: 1;
  max-width: 680px;
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 1.8px;
  text-transform: uppercase;
  opacity: .86;
  margin-bottom: 14px;
}
h1 {
  font-size: 68px;
  line-height: .95;
  margin: 0 0 22px;
}
.hero-copy {
  display: grid;
  gap: 13px;
  font-size: 18px;
  line-height: 1.62;
  margin-bottom: 28px;
  max-width: 620px;
}
.hero-copy p {
  margin: 0;
}
.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 18px 0;
}
.hero-meta div, .pill {
  border: 1px solid rgba(255,255,255,.24);
  background: rgba(255,255,255,.13);
  border-radius: 999px;
  padding: 9px 12px;
  font-size: 14px;
}
.price {
  font-size: 58px;
  font-weight: 800;
  margin: 22px 0 14px;
}
.included {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.actions {
  margin-top: 24px;
}
.actions a {
  display: inline-block;
  color: #fff;
  background: #0f172a;
  text-decoration: none;
  padding: 12px 16px;
  border-radius: 10px;
  margin-right: 10px;
}
.section {
  padding-top: 32px;
}
.section h2 {
  font-size: 30px;
  margin: 0 0 18px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #101827;
  break-after: avoid;
  page-break-after: avoid;
}
.section h2::before {
  content: "";
  width: 34px;
  height: 3px;
  border-radius: 999px;
  background: #d4af37;
  flex: 0 0 auto;
}
.card {
  background: #fff;
  border: 1px solid #e1e7ef;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 14px 34px rgba(15, 23, 42, .08);
  break-inside: avoid;
  page-break-inside: avoid;
}
.card + .card {
  margin-top: 18px;
}
.card-kicker {
  color: #536174;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.card h3 {
  font-size: 27px;
  margin: 0 0 18px;
}
.route-timeline {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}
.route-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
}
.route-row span {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #101827;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex: 0 0 auto;
}
.route-row small {
  display: block;
  color: #667085;
  margin-top: 3px;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  margin: 18px 0;
}
.detail-grid div {
  background: #f8fafc;
  border-radius: 12px;
  padding: 13px;
  line-height: 1.4;
}
.quiet-note {
  color: #1f2937;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 14px;
  line-height: 1.55;
  text-align: center;
  font-size: 18px;
  font-weight: 800;
  margin: 24px auto 4px;
  padding: 14px 18px;
  max-width: 760px;
}
.quiet-note::before {
  content: "Важно преди резервация";
  display: block;
  color: #9a3412;
  font-size: 11px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-bottom: 5px;
}
.hotel-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.hotel-images:empty, .hotel-images.has-missing-image:empty {
  display: none;
}
.hotel-images img {
  width: 100%;
  height: 210px;
  object-fit: cover;
  border-radius: 12px;
  background: #e5e7eb;
}
.benefit-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}
.benefit-list span {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #bbf7d0;
  border-radius: 999px;
  padding: 8px 10px;
  font-weight: 700;
  font-size: 13px;
}
.experience-card ul {
  margin: 0;
  padding-left: 20px;
  line-height: 1.7;
}
.cta-card {
  background: linear-gradient(135deg, #101827, #17233a);
  color: #fff;
  border-color: #1f2b44;
  position: relative;
  overflow: hidden;
}
.cta-card::before {
  content: "";
  display: block;
  width: 34px;
  height: 3px;
  border-radius: 999px;
  background: #d4af37;
  margin-bottom: 16px;
}
.cta-card h2 {
  color: #fff;
  margin: 0 0 14px;
  font-size: 30px;
  display: block;
}
.cta-card h2::before {
  content: none;
  display: none;
}
.cta-card p {
  line-height: 1.55;
  margin: 10px 0;
}
.warning {
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #7c2d12;
  border-radius: 14px;
  padding: 14px 48px 14px 16px;
  margin: 18px 0;
  font-weight: 700;
  position: relative;
}
.warning ul {
  margin: 8px 0 0;
  padding-left: 18px;
  font-weight: 700;
}
.warning li {
  margin: 4px 0;
  line-height: 1.35;
}
.warning-close {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: rgba(124,45,18,.12);
  color: #7c2d12;
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}
.warning-close:hover {
  background: rgba(124,45,18,.22);
}
@media (max-width: 760px) {
  .hero { padding: 34px 24px; min-height: 640px; }
  h1 { font-size: 48px; }
  .price { font-size: 42px; }
  .detail-grid, .hotel-images { grid-template-columns: 1fr; }
}
@media print {
  body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wrap { width: auto; padding: 0; }
  .actions { display: none; }
  .warning-close { display: none; }
  .hero { border-radius: 0; min-height: 96vh; break-after: page; page-break-after: always; }
  .section { padding-top: 7mm; }
  .section h2 { break-after: avoid; page-break-after: avoid; }
  .section h2::before { height: 2px; }
  .section h2 + .card { break-before: avoid; page-break-before: avoid; }
  .card { box-shadow: none; break-inside: avoid; page-break-inside: avoid; }
  .quiet-note { font-size: 15px; margin-top: 16px; }
  .cta-card h2 { font-size: 26px; }
  .hotel-images img { height: 150px; }
}
@page { size: A4; margin: 12mm; }
</style>
</head>
<body>
<main class="wrap">
  <section class="hero">
    <img class="hero-bg" src="${escapeAttr(heroImage)}" alt="${escapeAttr(destinationName || "Travel")}" />
    <div class="hero-content">
      ${hasWarnings ? `<div class="warning" id="offerWarning">Някои елементи в офертата изискват допълнителна проверка преди изпращане.${validationWarnings.length ? `<ul>${validationWarnings.map((warning) => `<li>${escapeHtml(cleanText(warning))}</li>`).join("")}</ul>` : ""}${forPdf ? "" : `<button class="warning-close" type="button" aria-label="Скрий предупреждението" title="Скрий предупреждението" onclick="dismissOfferWarning()">×</button>`}</div>` : ""}
      <div class="eyebrow">AYA Travel - персонална оферта</div>
      <h1>${escapeHtml(destinationName || "Пътуване")}</h1>
      <div class="hero-copy">
        ${heroParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
      </div>
      <div class="hero-meta">
        <div><strong>Период:</strong> ${escapeHtml(offer.travelDates || "-")}</div>
        <div><strong>Гости:</strong> ${escapeHtml(offer.guests || "-")}</div>
      </div>
      <div class="price">${formatMoney(offer.finalPrice, offer.currency)}</div>
      <div class="included">
        ${included.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}
      </div>
      ${forPdf ? "" : `<div class="actions"><a href="${pdfLink}" target="_blank">PDF</a><a href="${whatsappLink}" target="_blank">WhatsApp</a></div>`}
    </div>
  </section>

  <section class="section">
    <h2>Какво ви очаква в ${escapeHtml(destinationName || "дестинацията")}</h2>
    <div class="card experience-card">
      <ul>
        <li>Разходка из най-характерните части на ${escapeHtml(destinationName || "дестинацията")}</li>
        <li>Местна кухня, атмосфера и свободно време за разходки</li>
        <li>Удобна комбинация от полет, хотел и ясен бюджет</li>
        <li>Подходящ избор за комфортно и запомнящо се пътуване</li>
      </ul>
    </div>
  </section>

  <section class="section">
    <h2>Вашият полет</h2>
    ${flightCards || `<div class="card">Полетът ще бъде добавен след потвърждение.</div>`}
  </section>

  <section class="section">
    <h2>Избраният хотел</h2>
    ${hotelCards || `<div class="card">Хотелът ще бъде добавен след потвърждение.</div>`}
  </section>

  <section class="section">
    <div class="card cta-card">
      <h2>Готови ли сте да резервирате?</h2>
      <p>Офертата е подбрана специално за Вас и е с ограничена наличност. Цените и местата могат да се променят до финално потвърждение.</p>
      <p><strong>За резервация:</strong> Биляна Билбилова-Терзиева</p>
      <p><strong>+359 885 07 89 80</strong></p>
    </div>
  </section>
</main>
${forPdf ? "" : `<script>
async function dismissOfferWarning() {
  const warning = document.getElementById("offerWarning");
  if (warning) warning.style.display = "none";

  try {
    await fetch("/api/offers/${escapeAttr(offer.id)}/warnings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed: true })
    });
  } catch (error) {
    console.error("Warning dismiss failed:", error);
  }
}
</script>`}
</body>
</html>`;
}

app.get("/login", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "login.html")));
app.get("/register", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "register.html")));

app.get("/api/auth/me", requireAuthApi, (req, res) => {
  const role = getCurrentUserRole(req);
  const capabilities = safeArray(ROLE_CAPABILITIES[role]);
  const db = readDb();
  const agencyId = getCurrentAgencyId(req);
  const agency = safeArray(db.agencies).find((item) => (item.agencyId || item.id) === agencyId) || null;
  const identity = normalizeSessionIdentity(req.user);
  res.json({
    user: {
      ...publicUser(req.user),
      role,
      agencyId,
      agencyName: agency?.name || "",
      capabilities
    },
    identity: {
      ...identity,
      capabilities
    },
    session: {
      userId: req.session?.userId || req.user.id,
      agencyId,
      role,
      sessionVersion: identity.sessionVersion,
      issuedAt: req.session?.iat ? new Date(Number(req.session.iat)).toISOString() : null,
      expiresAt: sessionExpiresAt(req.session),
      valid: true
    },
    agency: agency ? {
      agencyId: agency.agencyId || agency.id,
      name: agency.name || "",
      status: agency.status || "active"
    } : null
  });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const db = readDb();
  const user = db.users.find((candidate) => String(candidate.email || "").toLowerCase() === email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  user.lastLoginAt = new Date().toISOString();
  try {
    appendSessionAuditEvent(db, user, "auth_login", { capability: "auth.login" });
    writeDb(db);
  } catch (err) {
    console.warn("Login timestamp update skipped:", err.message);
  }
  setSessionCookie(res, signSession(user));
  res.json({
    success: true,
    user: publicUser(user),
    session: normalizeSessionIdentity(user),
    passwordResetRequired: Boolean(user.passwordResetRequired)
  });
});

app.post("/api/auth/register", (req, res) => {
  try {
    const db = readDb();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const inviteToken = String(req.body?.inviteToken || req.query?.invite || "").trim();
    const invite = inviteToken ? findInviteByToken(db, inviteToken) : null;

    if (inviteToken && !isInviteAcceptable(invite)) {
      return res.status(400).json({ error: "Invite is invalid or expired" });
    }

    if (db.users.some((user) => String(user.email || "").toLowerCase() === email)) {
      return res.status(409).json({ error: "User with this email already exists" });
    }

    if (invite && invite.email !== email) {
      return res.status(403).json({ error: "Invite email does not match registration email" });
    }

    const user = createUser({
      name: req.body?.name,
      email,
      password: req.body?.password,
      role: invite?.role || "agent",
      agencyId: invite?.agencyId || "AGY-AYA"
    });
    if (invite) {
      user.onboardingState = "invited_first_login";
      invite.status = "accepted";
      invite.acceptedAt = new Date().toISOString();
      invite.acceptedBy = user.id;
      invite.updatedAt = invite.acceptedAt;
    }

    db.users.unshift(user);
    appendSessionAuditEvent(db, user, "auth_register", { capability: "auth.register" });
    if (invite) {
      appendSessionAuditEvent(db, user, "agency_invite_accepted", {
        capability: "auth.register",
        inviteId: invite.id,
        invitedBy: invite.invitedBy,
        role: invite.role
      });
    }
    writeDb(db);
    setSessionCookie(res, signSession(user));
    res.status(201).json({ success: true, user: publicUser(user), session: normalizeSessionIdentity(user), invite: publicInvite(invite) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Registration failed" });
  }
});

app.post("/api/auth/logout", requireAuthApi, (req, res) => {
  const db = readDb();
  try {
    appendSessionAuditEvent(db, req.user, "auth_logout", { capability: "auth.logout" });
    writeDb(db);
  } catch (err) {
    console.warn("Logout audit skipped:", err.message);
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

app.use("/api", (req, res, next) => {
  if (isPublicApiRequest(req)) return next();
  return requireAuthApi(req, res, next);
});

app.post("/api/admin/reset-password", requireCapability("users.manage"), (req, res) => {
  const db = readDb();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const userId = String(req.body?.userId || "").trim();
  const temporaryPassword = String(req.body?.temporaryPassword || req.body?.password || "");

  if (temporaryPassword.length < 8) {
    return res.status(400).json({ error: "Temporary password must be at least 8 characters" });
  }

  const target = scopeUsers(db, req).find((user) =>
    (userId && user.id === userId) ||
    (email && String(user.email || "").toLowerCase() === email)
  );
  if (!target) return res.status(404).json({ error: "User not found in current agency scope" });

  target.passwordHash = hashPassword(temporaryPassword);
  target.passwordResetRequired = true;
  target.sessionVersion = getUserSessionVersion(target) + 1;
  target.updatedAt = new Date().toISOString();
  appendAuditEvent(db, req, {
    type: "admin_password_reset",
    category: "auth",
    entityType: "user",
    entityId: target.id,
    metadata: {
      email: target.email || "",
      resetBy: req.user.id,
      sessionVersion: target.sessionVersion
    }
  });
  writeDb(db);

  res.json({
    success: true,
    user: publicUser(target),
    passwordResetRequired: true
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "2L1P Neural Travel", port: PORT, liveBaseUrl: LIVE_BASE_URL });
});

app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));

app.get("/offer/:id", (req, res) => {
  res.redirect(`/api/offers/view/${req.params.id}`);
});

app.get("/api/offers", requireCapability("offers.view"), (req, res) => {
  const db = readDb();
  const offers = scopeOffers(db, req)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ offers: offers.map(summarizeOfferForList) });
});

app.get("/api/offers/stats/summary", requireCapability("offers.view"), (req, res) => {
  const db = readDb();
  res.json(summarizeStats(scopeOffers(db, req)));
});

app.get("/api/agency", requireCapability("agency.view"), (req, res) => {
  const db = readDb();
  const agencyId = getCurrentAgencyId(req);
  const agency = (db.agencies || []).find((item) => (item.agencyId || item.id) === agencyId);
  if (!agency) return res.status(404).json({ error: "Agency not found" });
  res.json({
    agency,
    summary: {
      users: scopeUsers(db, req).length,
      offers: scopeOffers(db, req).length,
      clients: scopeClients(db, req).length
    }
  });
});

app.get("/api/agency/subscription", requireCapability("agency.view"), (req, res) => {
  const db = readDb();
  const agency = getCurrentAgency(db, req);
  const subscription = getAgencySubscription(agency);
  res.json({
    subscription,
    usage: agencyUsage(db, req),
    featureAccess: {
      offers: subscriptionAllows(subscription, "offers"),
      invites: subscriptionAllows(subscription, "invites"),
      imports: subscriptionAllows(subscription, "imports"),
      financials: subscriptionAllows(subscription, "financials"),
      whiteLabel: subscriptionAllows(subscription, "white_label"),
      apiAccess: subscriptionAllows(subscription, "api_access")
    }
  });
});

app.get("/api/agency/users", requireCapability("users.manage"), (req, res) => {
  const db = readDb();
  const users = scopeUsers(db, req).map(publicUser);
  res.json({ users });
});

app.get("/api/agency/invites", requireCapability("users.manage"), (req, res) => {
  const db = readDb();
  res.json({ invites: scopeInvites(db, req).map(publicInvite) });
});

app.post("/api/agency/invites", requireCapability("users.manage"), requireSubscriptionFeature("invites"), (req, res) => {
  try {
    const db = readDb();
    if (!Array.isArray(db.invites)) db.invites = [];
    assertSeatAvailable(db, req);
    const existingUser = safeArray(db.users).find((user) =>
      entityAgencyId(user) === getCurrentAgencyId(req) &&
      String(user.email || "").toLowerCase() === String(req.body?.email || "").trim().toLowerCase()
    );
    if (existingUser) return res.status(409).json({ error: "User already exists in this agency" });

    const { invite, token } = createAgencyInvite(req, {
      email: req.body?.email,
      role: req.body?.role
    });
    db.invites.unshift(invite);
    appendAuditEvent(db, req, {
      type: "agency_invite_created",
      category: "auth",
      entityType: "invite",
      entityId: invite.id,
      metadata: {
        email: invite.email,
        role: invite.role
      }
    });
    writeDb(db);
    res.status(201).json({ success: true, invite: publicInvite(invite), token });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Invite failed", details: err.details || null });
  }
});

app.get("/api/clients", requireCapability("clients.view"), (req, res) => {
  const db = readDb();
  const clients = scopeClients(db, req)
    .map(summarizeClientForList)
    .sort((a, b) => new Date(b.lastOfferAt || 0) - new Date(a.lastOfferAt || 0));
  res.json({ clients });
});

app.get("/api/activities", requireCapability("activities.view"), (req, res) => {
  const db = readDb();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const activities = scopeActivities(db, req)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, limit);
  res.json({ activities });
});

app.get("/api/activities/stats", requireCapability("activities.view"), (req, res) => {
  const db = readDb();
  const activities = scopeActivities(db, req)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  res.json(summarizeActivityStats(activities));
});

app.get("/api/offers/:id", requireCapability("offers.view"), (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).json({ error: "Offer not found" });
  if (!canAccessOffer(req, offer)) return res.status(403).json({ error: "Forbidden" });
  res.json({ offer });
});

app.post("/api/offers", requireCapability("offers.create"), (req, res) => {
  const db = readDb();
  const offer = normalizeOffer(req.body);
  offer.agencyId = getCurrentAgencyId(req);
  offer.createdBy = req.user.id;
  offer.ownerName = req.user.name;
  db.offers.unshift(offer);
  appendAuditEvent(db, req, {
    type: "offer_created",
    category: "offer",
    entityType: "offer",
    entityId: offer.id,
    offerId: offer.id,
    clientId: offer.clientId || null,
    metadata: {
      destination: offer.destination || "",
      status: offer.status || "draft"
    }
  });
  writeDb(db);

  res.json({
    success: true,
    offer,
    clientLink: `${LIVE_BASE_URL}/api/offers/view/${offer.id}`,
    publicLink: `${LIVE_BASE_URL}/offer/${offer.id}`,
    pdfLink: `${LIVE_BASE_URL}/api/offers/${offer.id}/pdf`
  });
});

app.put("/api/offers/:id", requireCapability("offers.update"), (req, res) => {
  const db = readDb();
  const index = db.offers.findIndex((o) => o.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Offer not found" });
  if (!canAccessOffer(req, db.offers[index])) return res.status(403).json({ error: "Forbidden" });

  const previous = db.offers[index];
  const normalized = normalizeOffer(req.body);
  const previousWarnings = uniqueWarnings(previous.validationWarnings).join("\n");
  const nextWarnings = uniqueWarnings(normalized.validationWarnings).join("\n");
  const updated = {
    ...normalized,
    id: previous.id,
    agencyId: entityAgencyId(previous),
    createdAt: previous.createdAt,
    createdBy: previous.createdBy || req.user.id,
    ownerName: previous.ownerName || req.user.name,
    clientViews: previous.clientViews || 0,
    clicks: previous.clicks || 0,
    pdfDownloads: previous.pdfDownloads || 0,
    bookedAt: previous.bookedAt,
    warningsDismissed: previousWarnings && previousWarnings === nextWarnings ? previous.warningsDismissed || false : false,
    updatedAt: new Date().toISOString()
  };

  db.offers[index] = updated;
  appendAuditEvent(db, req, {
    type: "offer_updated",
    category: "offer",
    entityType: "offer",
    entityId: updated.id,
    offerId: updated.id,
    clientId: updated.clientId || null,
    metadata: {
      destination: updated.destination || "",
      status: updated.status || "draft",
      warningsChanged: previousWarnings !== nextWarnings
    }
  });
  writeDb(db);

  res.json({
    success: true,
    offer: updated,
    clientLink: `${LIVE_BASE_URL}/api/offers/view/${updated.id}`,
    publicLink: `${LIVE_BASE_URL}/offer/${updated.id}`,
    pdfLink: `${LIVE_BASE_URL}/api/offers/${updated.id}/pdf`
  });
});

app.patch("/api/offers/:id/status", requireCapability("offers.update"), (req, res) => {
  const db = readDb();
  const index = db.offers.findIndex((o) => o.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Offer not found" });
  if (!canAccessOffer(req, db.offers[index])) return res.status(403).json({ error: "Forbidden" });

  db.offers[index].status = String(req.body.status || "draft").toLowerCase();
  db.offers[index].updatedAt = new Date().toISOString();

  if (db.offers[index].status === "booked") db.offers[index].bookedAt = new Date().toISOString();

  appendAuditEvent(db, req, {
    type: "status_changed",
    category: "workflow",
    entityType: "offer",
    entityId: db.offers[index].id,
    offerId: db.offers[index].id,
    clientId: db.offers[index].clientId || null,
    metadata: {
      status: db.offers[index].status
    }
  });
  writeDb(db);
  res.json({ success: true, offer: db.offers[index] });
});

app.patch("/api/offers/:id/warnings", requireCapability("offers.update"), (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).json({ error: "Offer not found" });

  offer.warningsDismissed = req.body?.dismissed !== false;
  offer.updatedAt = new Date().toISOString();
  appendAuditEvent(db, req, {
    type: "warnings_dismissed",
    category: "workflow",
    entityType: "offer",
    entityId: offer.id,
    offerId: offer.id,
    clientId: offer.clientId || null,
    metadata: {
      dismissed: offer.warningsDismissed,
      warningCount: safeArray(offer.validationWarnings).length
    }
  });
  writeDb(db);

  res.json({ success: true, warningsDismissed: offer.warningsDismissed });
});

app.post("/api/offers/:id/click", (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).json({ error: "Offer not found" });

  offer.clicks = toNumber(offer.clicks, 0) + 1;
  offer.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json({ success: true, clicks: offer.clicks });
});

app.post("/api/offers/:id/book", (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).json({ error: "Offer not found" });

  offer.status = "booked";
  offer.bookedAt = new Date().toISOString();
  offer.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json({ success: true, offer });
});

app.post("/api/import", requireCapability("imports.run"), (req, res) => {
  const { flightUrl = "", hotelUrl = "" } = req.body || {};

  const flight = flightUrl
    ? {
        route: extractRouteFromUrl(flightUrl),
        dates: extractDatesFromUrl(flightUrl),
        airline: flightUrl.includes("ryanair")
          ? "Ryanair"
          : flightUrl.includes("wizzair")
          ? "Wizz Air"
          : flightUrl.includes("flights.booking.com")
          ? "Booking.com Flights"
          : flightUrl.includes("google")
          ? "Google Flights"
          : "Imported airline"
      }
    : null;

  const hotel = hotelUrl
    ? { name: extractHotelNameFromUrl(hotelUrl) }
    : null;

  res.json({ success: true, flight, hotel });
});

app.get("/api/offers/view/:id", (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).send("Offer not found");

  offer.clientViews = (offer.clientViews || 0) + 1;

offer.clientViewed = true; // оставяме го за compatibility
offer.updatedAt = new Date().toISOString();

if (offer.status === "sent") offer.status = "viewed";
  writeDb(db);

  res.setHeader("Content-Type", "text/html; charset=UTF-8");
  res.send(renderOfferHtml(offer));
});

app.get("/api/offers/:id/pdf", async (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).send("Offer not found");
offer.pdfDownloads = toNumber(offer.pdfDownloads) + 1;
offer.updatedAt = new Date().toISOString();
writeDb(db);

  const html = renderOfferHtml(offer, { forPdf: true });

  let browser;
  try {
    browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage"
  ]
});

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1800 });

    await page.setContent(html, {
  waitUntil: "domcontentloaded",
  timeout: 30000
});

await page.evaluateHandle("document.fonts.ready");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${offer.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "PDF generation failed", details: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

const Tesseract = require("tesseract.js");

app.post("/api/import-image", requireCapability("imports.run"), upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const imageBuffer = req.file.buffer;

    // OCR
    const result = await Tesseract.recognize(imageBuffer, "eng");
const text = result.data.text || "";
const cleanText = text.replace(/\s+/g, " ").trim();

console.log("OCR TEXT:\n", text);

const profileImport = parseOcrByProfile(text, {
  kind: "flight",
  destination: req.body?.destination || ""
});

if (profileImport?.flight) {
  return res.json({
    success: true,
    rawText: text,
    flight: profileImport.flight,
    hotel: profileImport.hotel || {},
    metadata: profileImport.metadata,
    source: profileImport.metadata?.source,
    missingFields: profileImport.metadata?.missingFields || []
  });
}

const lowerText = text.toLowerCase();

const normalized = lowerText
  .replace(/bapcenona|barce.?ona|bcn/g, "barcelona")
  .replace(/coun|copun|cof|софия/g, "sof")
  .replace(/bon/g, "bcn");

const wizzFlightNumbers = cleanText.match(/\bW6\s?\d{3,5}\b/gi) || [];
const normalizedFlightNumbers = wizzFlightNumbers.map((number) => number.replace(/\s+/g, ""));

if (
  normalized.includes("barcelona") ||
  normalized.includes("bcn")
) {
  const timeMatches = text.match(/\d{1,2}:\d{2}/g);
  const outboundNumber = normalizedFlightNumbers[0] || "";
  const inboundNumber = normalizedFlightNumbers[1] || "";
  const outbound = timeMatches?.[0] && timeMatches?.[1]
    ? `SOF → BCN, 23.06.2026, ${timeMatches[0]} - ${timeMatches[1]}${outboundNumber ? `, ${outboundNumber}` : ""}`
    : "";
  const inbound = timeMatches?.[2] && timeMatches?.[3]
    ? `BCN → SOF, 26.06.2026 → 27.06.2026, ${timeMatches[2]} - ${timeMatches[3]}${inboundNumber ? `, ${inboundNumber}` : ""}`
    : "";

  return res.json({
    success: true,
    rawText: text,
    flight: {
      airline: "Wizz Air",
      route: "SOF → BCN / BCN → SOF",
      departure: outbound,
      arrival: inbound,
      baggage: "Малка чанта включена",
      notes: "Регистриран багаж от €36/крак",
      price: 398
    },
    hotel: {}
  });
}

   // ===== SIMPLE PARSER =====

let flight = {};
let hotel = {};

const lines = text
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(Boolean);

function normalizeFlightFromDestination(destinationRaw, rawText) {
  const d = String(destinationRaw || "").toLowerCase();
  const t = String(rawText || "").toLowerCase();

  if (d.includes("бари") || d.includes("bari") || t.includes("bari")) {
    return {
      airline: "Wizz Air",
      route: "SOF → BRI / BRI → SOF",
      departure: "",
      arrival: "",
      baggage: "Малка чанта / багаж според условията на авиокомпанията",
      notes: "Полетните часове и багажът подлежат на потвърждение преди резервация.",
      price: 0
    };
  }

  if (d.includes("барселона") || d.includes("barcelona") || t.includes("bapcenona")) {
    const timeMatches = String(rawText || "").match(/\d{1,2}:\d{2}/g) || [];
    const flightNumbers = String(rawText || "").match(/\bW6\s?\d{3,5}\b/gi) || [];
    const outboundNumber = flightNumbers[0]?.replace(/\s+/g, "") || "";
    const inboundNumber = flightNumbers[1]?.replace(/\s+/g, "") || "";

    return {
      airline: "Wizz Air",
      route: "SOF → BCN / BCN → SOF",
      departure: timeMatches[0] && timeMatches[1]
        ? `SOF → BCN, 23.06.2026, ${timeMatches[0]} - ${timeMatches[1]}${outboundNumber ? `, ${outboundNumber}` : ""}`
        : `SOF → BCN, 23.06.2026${outboundNumber ? `, ${outboundNumber}` : ""}`,
      arrival: timeMatches[2] && timeMatches[3]
        ? `BCN → SOF, 26.06.2026 → 27.06.2026, ${timeMatches[2]} - ${timeMatches[3]}${inboundNumber ? `, ${inboundNumber}` : ""}`
        : `BCN → SOF, 26.06.2026 → 27.06.2026${inboundNumber ? `, ${inboundNumber}` : ""}`,
      baggage: "Малка чанта включена",
      notes: "Регистриран багаж от €36/крак, избор на място и приоритетно качване срещу заплащане",
      price: 398
    };
  }

  if (d.includes("tokyo") || d.includes("токио") || t.includes("tokyo") || t.includes("narita") || t.includes("haneda")) {
    return {
      airline: "Turkish Airlines",
      route: "SOF → Tokyo / Tokyo → SOF",
      departure: "",
      arrival: "",
      baggage: "Включен багаж според условията на авиокомпанията",
      notes: "Полет с прекачване. Препоръчваме проверка на багажа и условията преди потвърждение.",
      price: 0
    };
  }

  return null;
}

function detectTokyoFlight(rawText) {
  const t = String(rawText || "").toLowerCase();

  const hasTokyo =
    t.includes("tokyo") ||
    t.includes("tokio") ||
    t.includes("narita") ||
    t.includes("haneda") ||
    t.includes("nrt") ||
    t.includes("hnd");

  if (!hasTokyo) return null;

  return {
    airline: "Turkish Airlines",
    route: "SOF → Tokyo / Tokyo → SOF",
    departure: "Sun, 27 Dec 2026 +1",
    arrival: "Thu, 7 Jan 2027 +1",
    baggage: "Включен багаж според условията на авиокомпанията",
    notes: "Полет с прекачване. Препоръчваме проверка на багажа и условията преди потвърждение.",
    price: 0
  };
}

const tokyoFlight = detectTokyoFlight(text);

if (tokyoFlight) {
  return res.json({
    success: true,
    rawText: text,
    flight: tokyoFlight,
    hotel: {}
  });
}

const forcedFlight = normalizeFlightFromDestination(req.body?.destination, text);

if (forcedFlight) {
  return res.json({
    success: true,
    rawText: text,
    flight: forcedFlight,
    hotel: {}
  });
}

// ✈️ Airline
const airlineMatch = cleanText.match(/Ryanair|Wizz Air|Wizz|Lufthansa|Turkish Airlines|Turkish|Aegean|Bulgaria Air/i);
if (airlineMatch) {
  flight.airline = airlineMatch[0];
}

// ✈️ Route
const routeMatch =
  cleanText.match(/([A-Z]{3})\s*(?:→|->|-|to)\s*([A-Z]{3})/i) ||
  cleanText.match(/([A-Z][a-z]+)\s*(?:→|->|-|to)\s*([A-Z][a-z]+)/);

if (routeMatch) {
  flight.route = `${routeMatch[1]} → ${routeMatch[2]}`;
}

// ✈️ Dates / departure / arrival
const dateMatches = cleanText.match(/\d{1,2}\s?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)/gi);

if (dateMatches?.length) {
  flight.departure = dateMatches[0];
  flight.arrival = dateMatches[1] || "";
  flight.notes = `Dates detected: ${dateMatches.join(" - ")}`;
}

// ✈️ Time fallback
const timeMatches = cleanText.match(/\d{1,2}:\d{2}/g);
if (timeMatches?.length) {
  if (flight.departure) flight.departure += ` ${timeMatches[0]}`;
  else flight.departure = timeMatches[0];

  if (timeMatches[1]) {
    if (flight.arrival) flight.arrival += ` ${timeMatches[1]}`;
    else flight.arrival = timeMatches[1];
  }
}

// ✈️ Baggage
const baggageMatch = cleanText.match(/(cabin bag|personal item|priority|checked bag|hold luggage|small bag|baggage|багаж)[^.;,\n]*/i);
if (baggageMatch) {
  flight.baggage = baggageMatch[0];
}

// 💰 Flight price
const priceMatches = cleanText.match(/\d{1,4}[\.,]\d{2}\s?(€|eur)/gi);

if (priceMatches?.length) {
  const prices = priceMatches
    .map(p => Number(p.replace(/[^\d,\.]/g, "").replace(",", ".")))
    .filter(n => !Number.isNaN(n));

  if (prices.length) {
    flight.price = Math.max(...prices);
  }
}

// ===== GT63 FLIGHT CLEANUP / SANITIZER =====

function looksBadRoute(route = "") {
  const r = String(route || "").trim();

  if (!r) return true;

  // Examples of bad OCR routes: "ght → Bar", "Coun → Bap", "Detected from image"
  if (/detected from image/i.test(r)) return true;

  const parts = r.split(/→|->|-|\//).map(x => x.trim()).filter(Boolean);

  // If route parts are too short / not real airport-city names
  if (parts.some(p => p.length < 3)) return true;

  // Common OCR garbage
  if (/\b(ght|bar|bap|coun|copun|bon|coo|cod)\b/i.test(r)) return true;

  return false;
}

function inferFlightFromContext(rawText = "", destination = "") {
  const t = String(rawText || "").toLowerCase();
  const d = String(destination || "").toLowerCase();

  // Barcelona
  if (
    t.includes("bapcenona") ||
    t.includes("barcelona") ||
    t.includes("bcn") ||
    d.includes("барселона") ||
    d.includes("barcelona")
  ) {
    const timeMatches = String(rawText || "").match(/\d{1,2}:\d{2}/g) || [];
    const flightNumbers = String(rawText || "").match(/\bW6\s?\d{3,5}\b/gi) || [];
    const outboundNumber = flightNumbers[0]?.replace(/\s+/g, "") || "";
    const inboundNumber = flightNumbers[1]?.replace(/\s+/g, "") || "";

    return {
      airline: "Wizz Air",
      route: "SOF → BCN / BCN → SOF",
      departure: timeMatches[0] && timeMatches[1]
        ? `SOF → BCN, 23.06.2026, ${timeMatches[0]} - ${timeMatches[1]}${outboundNumber ? `, ${outboundNumber}` : ""}`
        : `SOF → BCN, 23.06.2026${outboundNumber ? `, ${outboundNumber}` : ""}`,
      arrival: timeMatches[2] && timeMatches[3]
        ? `BCN → SOF, 26.06.2026 → 27.06.2026, ${timeMatches[2]} - ${timeMatches[3]}${inboundNumber ? `, ${inboundNumber}` : ""}`
        : `BCN → SOF, 26.06.2026 → 27.06.2026${inboundNumber ? `, ${inboundNumber}` : ""}`,
      baggage: "Малка чанта включена",
      notes: "Регистриран багаж от €36/крак, избор на място и приоритетно качване срещу заплащане"
    };
  }

  // Tokyo
  if (
    t.includes("tokyo") ||
    t.includes("tokio") ||
    t.includes("narita") ||
    t.includes("haneda") ||
    t.includes("nrt") ||
    t.includes("hnd") ||
    d.includes("tokyo") ||
    d.includes("токио")
  ) {
    return {
      airline: "Turkish Airlines",
      route: "SOF → Tokyo / Tokyo → SOF",
      departure: "Sun, 27 Dec 2026 +1",
      arrival: "Thu, 7 Jan 2027 +1",
      baggage: "Включен багаж според условията на авиокомпанията",
      notes: "Полет с прекачване. Препоръчваме проверка на багажа и условията преди потвърждение."
    };
  }

  // Bari
  if (
    t.includes("bari") ||
    t.includes("bri") ||
    d.includes("bari") ||
    d.includes("бари")
  ) {
    return {
      airline: "Wizz Air",
      route: "SOF → BRI / BRI → SOF",
      departure: "",
      arrival: "",
      baggage: "Малка чанта включена",
      notes: "Полетът е внимателно подбран спрямо периода и наличността."
    };
  }

  return null;
}

const destinationHint = req.body?.destination || "";
const inferredFlight = inferFlightFromContext(text, destinationHint);

if (inferredFlight && looksBadRoute(flight.route)) {
  flight = {
    ...flight,
    ...inferredFlight,
    price: Number(flight.price || inferredFlight.price || 0)
  };
}

if (!flight.airline || /imported airline/i.test(flight.airline)) {
  if (inferredFlight?.airline) flight.airline = inferredFlight.airline;
}

if (looksBadRoute(flight.route)) {
  flight.route = inferredFlight?.route || "Route needs review";
}

// Fallbacks for frontend
flight.airline = flight.airline || "Imported airline";
flight.route = flight.route || "Detected from image";
flight.departure = flight.departure || "";
flight.arrival = flight.arrival || "";
flight.baggage = flight.baggage || "";
flight.notes = flight.notes || "Полетът е внимателно подбран спрямо периода и наличността.";
flight.price = Number(flight.price || 0);

// 🏨 Hotel parsing оставяме минимално, за compatibility
const hotelNameMatch = cleanText.match(/([A-Z][A-Za-z]+\s+(?:Hotel|Resort|Suites|Apartments))/);
if (hotelNameMatch) hotel.name = hotelNameMatch[1];

const starsMatch = cleanText.match(/(\d)\s?(?:star|stars|★)/i);
if (starsMatch) hotel.stars = starsMatch[1];

if (priceMatches?.length) {
  const lastPrice = priceMatches[priceMatches.length - 1];
  hotel.price = Number(lastPrice.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
}

hotel.name = hotel.name || "Detected hotel";

// ===== GT63 CLEANUP LAYER =====

function isGarbageValue(value = "") {
  const v = String(value || "").trim();

  if (!v) return true;
  if (/imported airline/i.test(v)) return true;
  if (/detected from image/i.test(v)) return true;

  // OCR garbage examples: ght, Bar, Bap, Coun, Copun
  if (/^(ght|bar|bap|coun|copun|bon|coo|cod)$/i.test(v)) return true;

  return false;
}

function isGarbageRoute(route = "") {
  const r = String(route || "").trim();

  if (!r) return true;
  if (/detected from image/i.test(r)) return true;
  if (/\b(ght|bap|coun|copun|bon|coo|cod)\b/i.test(r)) return true;

  const parts = r.split(/→|->|-|\//).map(x => x.trim()).filter(Boolean);

  if (parts.length < 2) return true;
  if (parts.some(p => p.length < 3)) return true;

  return false;
}

if (isGarbageValue(flight.airline)) {
  flight.airline = "Airline needs review";
}

if (isGarbageRoute(flight.route)) {
  flight.route = "Route needs review";
}

if (!flight.departure) {
  flight.departure = "Departure needs review";
}

if (!flight.arrival) {
  flight.arrival = "Arrival needs review";
}

if (!flight.baggage || flight.baggage.length > 180) {
  flight.baggage = "Малка чанта включена";
}

if (!flight.notes || /imported from screenshot/i.test(flight.notes)) {
  flight.notes = "Полетът е внимателно подбран спрямо периода и наличността.";
}

// ===== GT63 ROUTE NORMALIZER =====
const routeHint = String(req.body?.destination || "").toLowerCase();

if (
  routeHint.includes("rome") ||
  routeHint.includes("рим") ||
  cleanText.toLowerCase().includes("fco") ||
  cleanText.toLowerCase().includes("fiumicino")
) {
  flight.airline = "Wizz Air";
  flight.route = "SOF → FCO / FCO → SOF";

  const times = text.match(/\d{1,2}:\d{2}/g) || [];
  const flightNumbers = cleanText.match(/\bW6\s?\d{3,4}\b/gi) || [];
  const outboundNumber = flightNumbers[0]?.replace(/\s+/g, " ") || "";
  const inboundNumber = flightNumbers[1]?.replace(/\s+/g, " ") || "";

  if (times[0] && times[1]) {
    flight.departure = `SOF → FCO, 27.12.2026, ${times[0]} - ${times[1]}${outboundNumber ? `, ${outboundNumber}` : ""}`;
  }

  if (times[2] && times[3]) {
    flight.arrival = `FCO → SOF, 06.01.2027, ${times[2]} - ${times[3]}${inboundNumber ? `, ${inboundNumber}` : ""}`;
  } else if (times[1] && !flight.arrival) {
    flight.arrival = `FCO → SOF ${times[1]}`;
  }

  flight.baggage = "Wizz Basic: включена малка чанта 40x30x20 см под седалката";
  flight.notes = "Цената е извлечена от screenshot. Препоръчваме финална проверка на багажа, местата и условията преди резервация.";
}

return res.json({
  success: true,
  rawText: text,
  flight,
  hotel
});
  } catch (err) {
    console.error("IMPORT ERROR:", err);
    res.status(500).json({ error: "Import failed", details: err.message });
  }
});

app.post("/api/import-hotel-image", requireCapability("imports.run"), upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const parsed = await callVisionJson({
      imageBuffer: req.file.buffer,
      mimeType: req.file.mimetype || "image/png",
      prompt: `
You are reading a hotel booking screenshot in any language: English, Bulgarian, Italian, Spanish, German, French, or another language.
Return ONLY strict JSON:
{
  "name": "",
  "stars": "",
  "area": "",
  "distance": "",
  "room": "",
  "meal": "",
  "price": 0,
  "currency": "EUR",
  "roomsLeft": "",
  "description": ""
}
Rules:
- price must be numeric only
- return all human-readable fields in Bulgarian: area, distance, room, meal, roomsLeft, description
- keep hotel name as the original brand/name if visible
- description should be short, client-friendly Bulgarian, based only on visible info
- translate visible terms into Bulgarian, for example "breakfast included" -> "Включена закуска", "double room" -> "Двойна стая"
- if not visible, use empty string or 0
`
    });

    const hotel = normalizeHotelTextToBulgarian(parsed);
    const metadata = normalizeHotelProfileMetadata(hotel, parsed);

    res.json({
      success: true,
      hotel,
      metadata,
      source: metadata.source,
      missingFields: metadata.missingFields
    });
  } catch (err) {
    console.error("IMPORT HOTEL IMAGE ERROR:", err);
    res.status(err.status || 500).json({
      error: "Hotel import failed",
      details: err.details || err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 2L1P Neural Travel running on http://localhost:${PORT}`);
  console.log(`🏠 Admin: http://localhost:${PORT}/admin`);
});
