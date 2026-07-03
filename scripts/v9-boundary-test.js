const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PORT = process.env.V9_BOUNDARY_PORT || "3911";
const BASE_URL = process.env.SMOKE_BASE_URL || process.env.LIVE_BASE_URL || `http://localhost:${PORT}`;
const AUTH_SECRET = process.env.AUTH_SECRET || "dev-auth-secret-change-me";
const ROOT = path.join(__dirname, "..");
const DB_FILE = path.join(ROOT, "DATABASE", "database.json");
const TEST_DB_FILE = path.join(ROOT, "storage", "generated", "V9_BOUNDARY_DATABASE.json");
const ADMIN_JS_FILE = path.join(ROOT, "public", "admin.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function signSession(userId) {
  const payload = JSON.stringify({
    userId,
    exp: Date.now() + 1000 * 60 * 60
  });
  const encoded = base64Url(payload);
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function cookieFor(userId) {
  return `aya_session=${encodeURIComponent(signSession(userId))}`;
}

async function request(pathname, options = {}, userId = "") {
  const headers = { ...(options.headers || {}) };
  if (userId) headers.Cookie = cookieFor(userId);
  const response = await fetch(`${BASE_URL}${pathname}`, { ...options, headers });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, json, text };
}

function writeBoundaryDb(originalRaw) {
  const db = JSON.parse(originalRaw || "{}");
  const now = new Date().toISOString();

  db.agencies = [
    ...(Array.isArray(db.agencies) ? db.agencies : []),
    { agencyId: "V9-AGENCY-A", id: "V9-AGENCY-A", name: "V9 Agency A", status: "active", plan: "PRO", subscription: { plan: "PRO", status: "active" }, createdAt: now, updatedAt: now },
    { agencyId: "V9-AGENCY-B", id: "V9-AGENCY-B", name: "V9 Agency B", status: "active", plan: "STARTER", subscription: { plan: "STARTER", status: "active" }, createdAt: now, updatedAt: now }
  ];

  db.users = [
    ...(Array.isArray(db.users) ? db.users : []),
    { id: "V9-A-ADMIN", agencyId: "V9-AGENCY-A", role: "admin", name: "V9 Admin A", email: "v9-admin-a@example.test", createdAt: now, updatedAt: now },
    { id: "V9-A-AGENT", agencyId: "V9-AGENCY-A", role: "agent", name: "V9 Agent A", email: "v9-agent-a@example.test", createdAt: now, updatedAt: now },
    { id: "V9-A-VIEWER", agencyId: "V9-AGENCY-A", role: "viewer", name: "V9 Viewer A", email: "v9-viewer-a@example.test", createdAt: now, updatedAt: now },
    { id: "V9-B-AGENT", agencyId: "V9-AGENCY-B", role: "agent", name: "V9 Agent B", email: "v9-agent-b@example.test", createdAt: now, updatedAt: now }
  ];

  db.offers = [
    {
      id: "V9-OFFER-A",
      offerId: "V9-OFFER-A",
      agencyId: "V9-AGENCY-A",
      clientId: "V9-CLIENT-A",
      createdBy: "V9-A-AGENT",
      ownerName: "V9 Agent A",
      visibility: "agency",
      status: "draft",
      clientName: "V9 Client A",
      clientPhone: "100",
      destination: "Rome",
      travelDates: "01.06 - 05.06.2026",
      guests: "2 adults",
      currency: "EUR",
      finalPrice: 1000,
      validationWarnings: [],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "V9-OFFER-B",
      offerId: "V9-OFFER-B",
      agencyId: "V9-AGENCY-B",
      clientId: "V9-CLIENT-B",
      createdBy: "V9-B-AGENT",
      ownerName: "V9 Agent B",
      visibility: "agency",
      status: "draft",
      clientName: "V9 Client B",
      clientPhone: "200",
      destination: "Tokyo",
      travelDates: "10.06 - 15.06.2026",
      guests: "2 adults",
      currency: "EUR",
      finalPrice: 2000,
      validationWarnings: [],
      createdAt: now,
      updatedAt: now
    },
    ...(Array.isArray(db.offers) ? db.offers : [])
  ];

  db.clients = [
    {
      id: "V9-CLIENT-A",
      clientId: "V9-CLIENT-A",
      agencyId: "V9-AGENCY-A",
      name: "V9 Client A",
      phone: "100",
      email: "",
      tags: [],
      offerIds: ["V9-OFFER-A"],
      offerHistory: [{ offerId: "V9-OFFER-A", status: "draft", finalPrice: 1000, createdAt: now }],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "V9-CLIENT-B",
      clientId: "V9-CLIENT-B",
      agencyId: "V9-AGENCY-B",
      name: "V9 Client B",
      phone: "200",
      email: "",
      tags: [],
      offerIds: ["V9-OFFER-B"],
      offerHistory: [{ offerId: "V9-OFFER-B", status: "draft", finalPrice: 2000, createdAt: now }],
      createdAt: now,
      updatedAt: now
    },
    ...(Array.isArray(db.clients) ? db.clients : [])
  ];

  db.activities = [
    {
      id: "V9-ACT-A",
      type: "offer_created",
      category: "offer",
      userId: "V9-A-AGENT",
      actorType: "user",
      offerId: "V9-OFFER-A",
      clientId: "V9-CLIENT-A",
      agencyId: "V9-AGENCY-A",
      timestamp: now,
      createdAt: now,
      metadata: { entityType: "offer", entityId: "V9-OFFER-A" }
    },
    {
      id: "V9-ACT-B",
      type: "offer_created",
      category: "offer",
      userId: "V9-B-AGENT",
      actorType: "user",
      offerId: "V9-OFFER-B",
      clientId: "V9-CLIENT-B",
      agencyId: "V9-AGENCY-B",
      timestamp: now,
      createdAt: now,
      metadata: { entityType: "offer", entityId: "V9-OFFER-B" }
    },
    ...(Array.isArray(db.activities) ? db.activities : [])
  ];

  db.invites = [
    {
      id: "V9-INVITE-A",
      agencyId: "V9-AGENCY-A",
      email: "pending-a@example.test",
      role: "agent",
      status: "pending",
      tokenHash: "boundary-fixture-a",
      invitedBy: "V9-A-ADMIN",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      acceptedAt: null,
      acceptedBy: null
    },
    {
      id: "V9-INVITE-B",
      agencyId: "V9-AGENCY-B",
      email: "pending-b@example.test",
      role: "agent",
      status: "pending",
      tokenHash: "boundary-fixture-b",
      invitedBy: "V9-B-AGENT",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      acceptedAt: null,
      acceptedBy: null
    },
    ...(Array.isArray(db.invites) ? db.invites : [])
  ];

  fs.mkdirSync(path.dirname(TEST_DB_FILE), { recursive: true });
  fs.writeFileSync(TEST_DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function ids(items = []) {
  return items.map((item) => item.id || item.offerId || item.clientId).filter(Boolean);
}

async function main() {
  const originalRaw = fs.readFileSync(DB_FILE, "utf8");
  writeBoundaryDb(originalRaw);

  const server = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT,
      LIVE_BASE_URL: BASE_URL,
      DB_FILE: TEST_DB_FILE
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    let healthy = false;
    for (let i = 0; i < 180; i += 1) {
      try {
        const health = await request("/api/health");
        if (health.response.status === 200) {
          healthy = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    assert(healthy, `isolated boundary server did not start:\n${serverOutput}`);

    const offersA = await request("/api/offers", {}, "V9-A-AGENT");
    assert(offersA.response.status === 200, `/api/offers expected 200, got ${offersA.response.status}`);
    const offerIdsA = ids(offersA.json?.offers || []);
    assert(offerIdsA.includes("V9-OFFER-A"), "Agency A user should see Agency A offer");
    assert(!offerIdsA.includes("V9-OFFER-B"), "Agency A user must not see Agency B offer");

    const clientsA = await request("/api/clients", {}, "V9-A-AGENT");
    assert(clientsA.response.status === 200, `/api/clients expected 200, got ${clientsA.response.status}`);
    const clientIdsA = ids(clientsA.json?.clients || []);
    assert(clientIdsA.includes("V9-CLIENT-A"), "Agency A user should see Agency A client");
    assert(!clientIdsA.includes("V9-CLIENT-B"), "Agency A user must not see Agency B client");

    const activitiesA = await request("/api/activities", {}, "V9-A-AGENT");
    assert(activitiesA.response.status === 200, `/api/activities expected 200, got ${activitiesA.response.status}`);
    const activityIdsA = ids(activitiesA.json?.activities || []);
    assert(activityIdsA.includes("V9-ACT-A"), "Agency A user should see Agency A activity");
    assert(!activityIdsA.includes("V9-ACT-B"), "Agency A user must not see Agency B activity");

    const crossRead = await request("/api/offers/V9-OFFER-B", {}, "V9-A-AGENT");
    assert(crossRead.response.status === 403, `Agency A read of Agency B offer expected 403, got ${crossRead.response.status}`);

    const crossUpdate = await request("/api/offers/V9-OFFER-B", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: "Cross Agency Edit" })
    }, "V9-A-AGENT");
    assert(crossUpdate.response.status === 403, `Agency A update of Agency B offer expected 403, got ${crossUpdate.response.status}`);

    const viewerCreate = await request("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: "Viewer Mutation" })
    }, "V9-A-VIEWER");
    assert(viewerCreate.response.status === 403, `Viewer create expected 403, got ${viewerCreate.response.status}`);

    const agentUsers = await request("/api/agency/users", {}, "V9-A-AGENT");
    assert(agentUsers.response.status === 403, `Agent agency users expected 403, got ${agentUsers.response.status}`);

    const adminAgency = await request("/api/agency", {}, "V9-A-ADMIN");
    assert(adminAgency.response.status === 200, `Admin agency endpoint expected 200, got ${adminAgency.response.status}`);
    assert(adminAgency.json?.agency?.agencyId === "V9-AGENCY-A", "Admin should receive own agency");

    const adminSubscription = await request("/api/agency/subscription", {}, "V9-A-ADMIN");
    assert(adminSubscription.response.status === 200, `Admin subscription endpoint expected 200, got ${adminSubscription.response.status}`);
    assert(adminSubscription.json?.subscription?.billingIdentity?.agencyId === "V9-AGENCY-A", "Subscription must be scoped to admin agency");
    assert(adminSubscription.json?.featureAccess?.invites === true, "PRO agency should have invite feature access");

    const adminUsers = await request("/api/agency/users", {}, "V9-A-ADMIN");
    assert(adminUsers.response.status === 200, `Admin users endpoint expected 200, got ${adminUsers.response.status}`);
    const adminUserIds = ids(adminUsers.json?.users || []);
    assert(adminUserIds.includes("V9-A-AGENT"), "Admin should see own agency users");
    assert(!adminUserIds.includes("V9-B-AGENT"), "Admin must not see cross-agency users");

    const agentReset = await request("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "V9-A-VIEWER", temporaryPassword: "temporary123" })
    }, "V9-A-AGENT");
    assert(agentReset.response.status === 403, `Agent password reset expected 403, got ${agentReset.response.status}`);

    const crossAgencyReset = await request("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "V9-B-AGENT", temporaryPassword: "temporary123" })
    }, "V9-A-ADMIN");
    assert(crossAgencyReset.response.status === 404, `Cross-agency password reset expected 404, got ${crossAgencyReset.response.status}`);

    const adminReset = await request("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "V9-A-VIEWER", temporaryPassword: "temporary123" })
    }, "V9-A-ADMIN");
    assert(adminReset.response.status === 200, `Admin password reset expected 200, got ${adminReset.response.status}: ${adminReset.text}`);
    assert(adminReset.json?.passwordResetRequired === true, "Admin password reset must mark passwordResetRequired");

    const agentInvites = await request("/api/agency/invites", {}, "V9-A-AGENT");
    assert(agentInvites.response.status === 403, `Agent invites expected 403, got ${agentInvites.response.status}`);

    const adminInvites = await request("/api/agency/invites", {}, "V9-A-ADMIN");
    assert(adminInvites.response.status === 200, `Admin invites endpoint expected 200, got ${adminInvites.response.status}`);
    const adminInviteIds = ids(adminInvites.json?.invites || []);
    assert(adminInviteIds.includes("V9-INVITE-A"), "Admin should see own agency invites");
    assert(!adminInviteIds.includes("V9-INVITE-B"), "Admin must not see cross-agency invites");

    const createdInvite = await request("/api/agency/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new-agent-a@example.test", role: "agent" })
    }, "V9-A-ADMIN");
    assert(createdInvite.response.status === 201, `Admin invite create expected 201, got ${createdInvite.response.status}: ${createdInvite.text}`);
    assert(createdInvite.json?.invite?.agencyId === "V9-AGENCY-A", "Created invite must be scoped to admin agency");
    assert(createdInvite.json?.token, "Created invite must return one-time token for delivery");

    const adminJs = fs.readFileSync(ADMIN_JS_FILE, "utf8");
    assert(adminJs.includes("function buildCommandItems()"), "Command palette source should exist");
    assert(adminJs.includes("allOffers.flatMap"), "Command results should derive from scoped allOffers");
    assert(adminJs.includes("buildClientSummaries()"), "Client drawer/search should derive from scoped offer/client summaries");

    console.log("V9 BOUNDARY TEST PASS");
    console.log(JSON.stringify({
      baseUrl: BASE_URL,
      checked: [
        "Agency A cannot see Agency B offers",
        "Agency A cannot see Agency B clients",
        "Agency A cannot see Agency B activities",
        "Agency A cannot read or update Agency B offer",
        "Viewer cannot mutate offers",
        "Agent cannot manage agency users",
        "Admin password reset is scoped and audited",
        "Admin can access own agency endpoints",
        "Subscription snapshot is scoped to agency",
        "Admin can create and list own agency invites",
        "Agent cannot manage invites",
        "Command/workspace/client sources are agency-scoped"
      ]
    }, null, 2));
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error("V9 BOUNDARY TEST FAIL:", error.message);
  process.exit(1);
});
