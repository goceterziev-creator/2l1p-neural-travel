const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DB_FILE = path.join(ROOT, "DATABASE", "database.json");
const SERVER_FILE = path.join(ROOT, "server.js");
const QA_FILE = path.join(ROOT, "docs", "QA_CHECKLIST.md");
const ARCH_FILE = path.join(ROOT, "docs", "V9_MULTI_AGENCY_ARCHITECTURE.md");
const BOUNDARY_FILE = path.join(ROOT, "scripts", "v9-boundary-test.js");
const PRODUCTION_CHECK_FILE = path.join(ROOT, "scripts", "production-check.js");
const PACKAGE_FILE = path.join(ROOT, "package.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function idOf(value = {}) {
  return value.agencyId || value.clientId || value.offerId || value.id || "";
}

function checkArchitectureContract() {
  const arch = readText(ARCH_FILE);
  assert(arch.includes("GT63 V9.0 = ARCHITECTURE_LAYER_START"), "V9 architecture status missing");
  assert(arch.includes("GT63 V9.2 = ROLE_CAPABILITY_MATRIX"), "V9.2 role capability status missing");
  assert(arch.includes("GT63 V9.3 = AUDIT_CONSISTENCY_LAYER"), "V9.3 audit consistency status missing");
  assert(arch.includes("GT63 V9.4 = BOUNDARY_TEST_HARNESS"), "V9.4 boundary harness status missing");
  assert(arch.includes("GT63 V9.6 = SESSION_IDENTITY_CONSISTENCY"), "V9.6 session identity status missing");
  assert(arch.includes("GT63 V9.7 = AGENCY_INVITE_ARCHITECTURE"), "V9.7 invite architecture status missing");
  assert(arch.includes("GT63 V9.8 = SUBSCRIPTION_PLAN_BOUNDARIES"), "V9.8 subscription boundary status missing");
  assert(arch.includes("GT63 V9.9 = PRODUCTION_READINESS_GATE"), "V9.9 production readiness status missing");
  assert(arch.includes("Identity -> Agency Scope -> Role Contract -> Data Access -> Audit -> UI"), "V9 architecture principle missing");
  assert(arch.includes("session -> identity -> agency scope -> capability -> audit -> UI reflection"), "V9.6 session identity rule missing");
  assert(arch.includes("identity -> agency -> invite -> role -> first login -> audit -> UI"), "V9.7 invite flow rule missing");
  assert(arch.includes("agency -> subscription -> plan contract -> limits -> feature gates -> audit -> billing provider"), "V9.8 subscription flow rule missing");
  assert(arch.includes("qa pass -> production check pass -> commit -> deploy candidate"), "V9.9 production readiness flow missing");
  assert(arch.includes("UI comes last"), "V9 must state UI comes last");
  assert(arch.includes("routes require capabilities; routes do not check roles"), "V9.2 route capability rule missing");
  assert(arch.includes("protected mutation -> capability -> agency scope -> mutation -> audit event -> writeDb"), "V9.3 mutation audit rule missing");
  assert(arch.includes("node scripts/v9-boundary-test.js"), "V9.4 boundary harness command missing");
  assert(arch.includes("node scripts/v9-architecture-check.js"), "V9 gate command missing");
  console.log("ok V9 architecture contract");
}

function checkQaLock() {
  const qa = readText(QA_FILE);
  assert(qa.includes("GT63 V8.18.1 = RELEASE_CANDIDATE_LOCK"), "V8 RC lock missing");
  assert(qa.includes("V9 = architecture-first"), "V9 architecture-first rule missing");
  assert(qa.includes("V9 must start as an architecture layer"), "V9 architecture rule missing");
  console.log("ok V8 RC lock and V9 policy");
}

function checkServerBoundaryHelpers() {
  const server = readText(SERVER_FILE);
  [
    "function getCurrentAgencyId(",
    "function requireAgencyScope(",
    "function scopeOffers(",
    "function scopeClients(",
    "function scopeActivities(",
    "function scopeUsers(",
    "function assertSameAgency(",
    "function canAccessOffer(",
    "const ROLE_CAPABILITIES =",
    "function getCurrentUserRole(",
    "function can(",
    "function requireCapability(",
    "function normalizeSessionIdentity(",
    "function resolveSessionContext(",
    "function isSessionValidForUser(",
    "function createAgencyInvite(",
    "function findInviteByToken(",
    "function isInviteAcceptable(",
    "function publicInvite(",
    "function scopeInvites(",
    "const PLAN_CONTRACTS =",
    "function getPlanContract(",
    "function getAgencySubscription(",
    "function subscriptionAllows(",
    "function requireSubscriptionFeature(",
    "function agencyUsage(",
    "function assertSeatAvailable(",
    "function createAuditEvent(",
    "function appendAuditEvent(",
    "function appendSessionAuditEvent("
  ].forEach((needle) => {
    assert(server.includes(needle), `${needle} missing`);
  });

  assert(!server.includes("function isAdmin("), "routes must use capabilities instead of legacy isAdmin");
  assert(!server.includes("function getAgencyId("), "legacy getAgencyId helper should not exist in V9.1");
  assert(!server.includes("function filterOffersForUser("), "routes must not use legacy filterOffersForUser");
  assert(!server.includes("function filterClientsForUser("), "routes must not use legacy filterClientsForUser");
  assert(!server.includes("function filterActivitiesForUser("), "routes must not use legacy filterActivitiesForUser");
  assert(/app\.get\("\/api\/offers", requireCapability\("offers\.view"\)/.test(server), "/api/offers must require offers.view");
  assert(/app\.post\("\/api\/offers", requireCapability\("offers\.create"\)/.test(server), "/api/offers POST must require offers.create");
  assert(/app\.put\("\/api\/offers\/:id", requireCapability\("offers\.update"\)/.test(server), "/api/offers PUT must require offers.update");
  assert(/app\.patch\("\/api\/offers\/:id\/status", requireCapability\("offers\.update"\)/.test(server), "/api/offers status must require offers.update");
  assert(/app\.get\("\/api\/clients", requireCapability\("clients\.view"\)/.test(server), "/api/clients must require clients.view");
  assert(/app\.get\("\/api\/activities", requireCapability\("activities\.view"\)/.test(server), "/api/activities must require activities.view");
  assert(/app\.get\("\/api\/agency", requireCapability\("agency\.view"\)/.test(server), "/api/agency must require agency.view");
  assert(/app\.get\("\/api\/agency\/subscription", requireCapability\("agency\.view"\)[\s\S]*getAgencySubscription\(agency\)[\s\S]*agencyUsage\(db, req\)/.test(server), "/api/agency/subscription must be scoped read-only subscription endpoint");
  assert(/app\.get\("\/api\/agency\/users", requireCapability\("users\.manage"\)/.test(server), "/api/agency/users must require users.manage");
  assert(/app\.get\("\/api\/agency\/invites", requireCapability\("users\.manage"\)[\s\S]*scopeInvites\(db, req\)/.test(server), "/api/agency/invites must require users.manage and scopeInvites");
  assert(/app\.post\("\/api\/agency\/invites", requireCapability\("users\.manage"\), requireSubscriptionFeature\("invites"\)[\s\S]*assertSeatAvailable\(db, req\)[\s\S]*createAgencyInvite\(req/.test(server), "invite creation must require users.manage, subscription feature, seat check, and createAgencyInvite");
  assert(/app\.post\("\/api\/import-image", requireCapability\("imports\.run"\)/.test(server), "/api/import-image must require imports.run");
  assert(/req\.requiredCapability = capability;/.test(server), "requireCapability must attach capability to request context");
  assert(/app\.get\("\/api\/auth\/me", requireAuthApi[\s\S]*identity:[\s\S]*session:[\s\S]*agency:/.test(server), "/api/auth/me must return normalized identity/session/agency shape");
  assert(/function signSession\(userOrId\)[\s\S]*agencyId[\s\S]*role[\s\S]*sessionVersion[\s\S]*iat[\s\S]*exp/.test(server), "signSession must include V9.6 identity fields");
  assert(/app\.post\("\/api\/auth\/login"[\s\S]*appendSessionAuditEvent\(db, user, "auth_login"/.test(server), "login must append auth audit event");
  assert(/app\.post\("\/api\/auth\/register"[\s\S]*appendSessionAuditEvent\(db, user, "auth_register"/.test(server), "register must append auth audit event");
  assert(/app\.post\("\/api\/auth\/register"[\s\S]*findInviteByToken\(db, inviteToken\)/.test(server), "register must resolve invite tokens");
  assert(/app\.post\("\/api\/auth\/register"[\s\S]*role: invite\?\.role/.test(server), "invite acceptance must assign role from invite");
  assert(/app\.post\("\/api\/auth\/register"[\s\S]*agencyId: invite\?\.agencyId/.test(server), "invite acceptance must assign agency from invite");
  assert(/app\.post\("\/api\/auth\/register"[\s\S]*onboardingState = "invited_first_login"/.test(server), "invite acceptance must set onboarding state");
  assert(/app\.post\("\/api\/auth\/logout", requireAuthApi[\s\S]*appendSessionAuditEvent\(db, req\.user, "auth_logout"/.test(server), "logout must append auth audit event");
  assert(/app\.get\("\/api\/offers"[\s\S]*scopeOffers\(db, req\)/.test(server), "/api/offers must use scopeOffers(db, req)");
  assert(/app\.get\("\/api\/clients"[\s\S]*scopeClients\(db, req\)/.test(server), "/api/clients must use scopeClients(db, req)");
  assert(/app\.get\("\/api\/activities"[\s\S]*scopeActivities\(db, req\)/.test(server), "/api/activities must use scopeActivities(db, req)");
  assert(/app\.get\("\/api\/agency"[\s\S]*scopeUsers\(db, req\)[\s\S]*scopeOffers\(db, req\)[\s\S]*scopeClients\(db, req\)/.test(server), "/api/agency summary must use centralized scope helpers");
  assert(/app\.post\("\/api\/offers"[\s\S]*offer\.agencyId = getCurrentAgencyId\(req\)/.test(server), "new offers must stamp agencyId from current request");
  assert(/app\.post\("\/api\/offers", requireCapability\("offers\.create"\)[\s\S]*appendAuditEvent\(db, req,[\s\S]*type: "offer_created"[\s\S]*writeDb\(db\)/.test(server), "offer create must append audit event before writeDb");
  assert(/app\.put\("\/api\/offers\/:id", requireCapability\("offers\.update"\)[\s\S]*appendAuditEvent\(db, req,[\s\S]*type: "offer_updated"[\s\S]*writeDb\(db\)/.test(server), "offer update must append audit event before writeDb");
  assert(/app\.patch\("\/api\/offers\/:id\/status", requireCapability\("offers\.update"\)[\s\S]*appendAuditEvent\(db, req,[\s\S]*type: "status_changed"[\s\S]*writeDb\(db\)/.test(server), "status update must append audit event before writeDb");
  assert(/app\.patch\("\/api\/offers\/:id\/warnings", requireCapability\("offers\.update"\)[\s\S]*appendAuditEvent\(db, req,[\s\S]*type: "warnings_dismissed"[\s\S]*writeDb\(db\)/.test(server), "warning update must append audit event before writeDb");
  console.log("ok V9 server boundary helpers");
}

function checkDbShape() {
  const db = readJson(DB_FILE);
  const agencies = Array.isArray(db.agencies) ? db.agencies : [];
  const users = Array.isArray(db.users) ? db.users : [];
  const offers = Array.isArray(db.offers) ? db.offers : [];
  const clients = Array.isArray(db.clients) ? db.clients : [];
  const activities = Array.isArray(db.activities) ? db.activities : [];

  assert(agencies.length > 0, "expected at least one agency");

  const agencyIds = new Set(agencies.map(idOf).filter(Boolean));
  assert(agencyIds.size === agencies.length, "agency ids must be unique and present");

  const invalidUsers = users.filter((user) => !agencyIds.has(user.agencyId || "AGY-AYA"));
  const invalidOffers = offers.filter((offer) => !agencyIds.has(offer.agencyId || "AGY-AYA"));
  const invalidClients = clients.filter((client) => !agencyIds.has(client.agencyId || "AGY-AYA"));
  const invalidActivities = activities.filter((activity) => activity.agencyId && !agencyIds.has(activity.agencyId));
  const invalidRoles = users.filter((user) => !["owner", "admin", "agent", "viewer"].includes(String(user.role || "").toLowerCase()));

  assert(invalidUsers.length === 0, `users with invalid agencyId: ${invalidUsers.length}`);
  assert(invalidOffers.length === 0, `offers with invalid agencyId: ${invalidOffers.length}`);
  assert(invalidClients.length === 0, `clients with invalid agencyId: ${invalidClients.length}`);
  assert(invalidActivities.length === 0, `activities with invalid agencyId: ${invalidActivities.length}`);
  assert(invalidRoles.length === 0, `users with invalid roles: ${invalidRoles.length}`);

  console.log("ok V9 database agency shape");
}

function checkBoundaryHarness() {
  const boundary = readText(BOUNDARY_FILE);
  const productionCheck = readText(PRODUCTION_CHECK_FILE);
  const pkg = readJson(PACKAGE_FILE);

  [
    "V9-AGENCY-A",
    "V9-AGENCY-B",
    "V9-OFFER-A",
    "V9-OFFER-B",
    "V9-CLIENT-A",
    "V9-CLIENT-B",
    "V9-A-VIEWER",
    "V9-A-AGENT",
    "V9-A-ADMIN",
    "V9-B-AGENT"
  ].forEach((needle) => {
    assert(boundary.includes(needle), `boundary harness missing ${needle}`);
  });

  assert(boundary.includes("TEST_DB_FILE"), "boundary harness must use isolated test DB");
  assert(boundary.includes("DB_FILE: TEST_DB_FILE"), "boundary harness server must use isolated test DB env");
  assert(boundary.includes("/api/offers/V9-OFFER-B"), "boundary harness must test cross-agency offer access");
  assert(boundary.includes("/api/agency/users"), "boundary harness must test agency user management boundary");
  assert(boundary.includes("/api/agency/invites"), "boundary harness must test agency invite boundary");
  assert(boundary.includes("/api/agency/subscription"), "boundary harness must test agency subscription boundary");
  assert(boundary.includes("V9-INVITE-A"), "boundary harness must include agency invite fixtures");
  assert(boundary.includes("allOffers.flatMap"), "boundary harness must verify command source is scoped");
  assert(pkg.scripts?.["v9:boundary"] === "node scripts/v9-boundary-test.js", "package.json missing v9:boundary script");
  assert(String(pkg.scripts?.qa || "").includes("node scripts/v9-boundary-test.js"), "npm run qa must include boundary test");
  assert(pkg.scripts?.["production:check"] === "node scripts/production-check.js", "package.json missing production:check script");
  [
    "AUTH_SECRET",
    "LIVE_BASE_URL",
    "database backup available",
    "PDF engine require",
    "Render start command",
    "GT63_MASTER_HANDOVER_V9.md"
  ].forEach((needle) => {
    assert(productionCheck.includes(needle), `production check missing ${needle}`);
  });
  console.log("ok V9 boundary harness contract");
}

function main() {
  checkArchitectureContract();
  checkQaLock();
  checkServerBoundaryHelpers();
  checkDbShape();
  checkBoundaryHarness();
  console.log("V9 ARCHITECTURE CHECK PASS");
}

try {
  main();
} catch (error) {
  console.error("V9 ARCHITECTURE CHECK FAIL:", error.message);
  process.exit(1);
}
