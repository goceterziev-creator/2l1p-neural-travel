const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR || process.env.PERSISTENT_DATA_DIR || ROOT;
const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(DATA_DIR, "DATABASE", "database.json");
const REQUIRED_DIRS = [
  path.join(DATA_DIR, "DATABASE"),
  path.join(ROOT, "backups"),
  path.join(ROOT, "storage"),
  path.join(ROOT, "storage", "generated"),
  path.join(ROOT, "public")
];
const REQUIRED_DOCS = [
  path.join(ROOT, "docs", "GT63_MASTER_HANDOVER_V9.md"),
  path.join(ROOT, "docs", "QA_CHECKLIST.md"),
  path.join(ROOT, "docs", "V9_MULTI_AGENCY_ARCHITECTURE.md")
];
const results = [];

function record(name, ok, details = "") {
  results.push({ name, ok, details });
  console.log(`${ok ? "ok" : "fail"} ${name}${details ? ` - ${details}` : ""}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function checkEnv() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const liveBaseUrl = process.env.LIVE_BASE_URL || "";
  const authSecret = process.env.AUTH_SECRET || "";
  const isProduction = nodeEnv === "production";
  const hasPersistentDataEnv = Boolean(process.env.DB_FILE || process.env.DATA_DIR || process.env.PERSISTENT_DATA_DIR);
  const dbInsideProjectRoot = path.relative(ROOT, DB_FILE) && !path.relative(ROOT, DB_FILE).startsWith("..") && !path.isAbsolute(path.relative(ROOT, DB_FILE));
  const forceAdminPasswordReset = process.env.ADMIN_FORCE_PASSWORD_RESET === "true";

  record("NODE_ENV present", Boolean(nodeEnv), nodeEnv);
  record("LIVE_BASE_URL configured", !isProduction || /^https:\/\//.test(liveBaseUrl), liveBaseUrl || "missing");
  record("AUTH_SECRET configured", !isProduction || (authSecret && authSecret !== "dev-auth-secret-change-me" && authSecret.length >= 32), isProduction ? "production secret required" : "development allowed");
  record("PORT compatible", Boolean(process.env.PORT || !isProduction), process.env.PORT || "development default");
  record("persistent data env configured", !isProduction || hasPersistentDataEnv, hasPersistentDataEnv ? `DB=${DB_FILE}` : "set DB_FILE or DATA_DIR on Render persistent disk");
  record("database outside project root in production", !isProduction || !dbInsideProjectRoot, DB_FILE);
  record("bootstrap admin reset disabled", !isProduction || !forceAdminPasswordReset, forceAdminPasswordReset ? "remove ADMIN_FORCE_PASSWORD_RESET after recovery" : "disabled");
}

function checkStorage() {
  REQUIRED_DIRS.forEach((dir) => {
    record(`directory ${path.relative(ROOT, dir)}`, fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  });

  record("database file exists", fs.existsSync(DB_FILE), DB_FILE);
  if (!fs.existsSync(DB_FILE)) return;

  const backupFile = `${DB_FILE}.bak`;
  const backupDir = path.join(ROOT, "backups");
  const backupDirHasFiles = fs.existsSync(backupDir) && fs.readdirSync(backupDir).some((name) => name.endsWith(".json"));
  record("database backup available", fs.existsSync(backupFile) || backupDirHasFiles, fs.existsSync(backupFile) ? backupFile : backupDir);
}

function checkDatabase() {
  if (!fs.existsSync(DB_FILE)) return;
  const db = readJson(DB_FILE);
  const agencies = Array.isArray(db.agencies) ? db.agencies : [];
  const users = Array.isArray(db.users) ? db.users : [];
  const offers = Array.isArray(db.offers) ? db.offers : [];
  const activities = Array.isArray(db.activities) ? db.activities : [];

  record("agencies present", agencies.length > 0, String(agencies.length));
  record("users present", users.length > 0, String(users.length));
  record("offers array present", Array.isArray(db.offers), String(offers.length));
  record("activities array present", Array.isArray(db.activities), String(activities.length));

  const agencyIds = new Set(agencies.map((agency) => agency.agencyId || agency.id).filter(Boolean));
  record("agency ids unique", agencyIds.size === agencies.length, String(agencyIds.size));
  record("users scoped to valid agencies", users.every((user) => agencyIds.has(user.agencyId || "AGY-AYA")));
  record("offers scoped to valid agencies", offers.every((offer) => agencyIds.has(offer.agencyId || "AGY-AYA")));
}

function checkRuntimeDependencies() {
  const pkg = readJson(path.join(ROOT, "package.json"));
  const deps = pkg.dependencies || {};
  record("express dependency", Boolean(deps.express), deps.express || "missing");
  record("puppeteer dependency", Boolean(deps.puppeteer), deps.puppeteer || "missing");
  record("tesseract dependency", Boolean(deps["tesseract.js"]), deps["tesseract.js"] || "missing");
  try {
    require("puppeteer");
    record("PDF engine require", true, "puppeteer");
  } catch (error) {
    record("PDF engine require", false, error.message);
  }
}

function checkDocsAndScripts() {
  REQUIRED_DOCS.forEach((file) => {
    record(`doc ${path.relative(ROOT, file)}`, fs.existsSync(file));
  });

  const pkg = readJson(path.join(ROOT, "package.json"));
  record("qa script present", Boolean(pkg.scripts?.qa), pkg.scripts?.qa || "missing");
  record("production check script present", Boolean(pkg.scripts?.["production:check"]), pkg.scripts?.["production:check"] || "missing");
  record("v9 boundary script present", pkg.scripts?.["v9:boundary"] === "node scripts/v9-boundary-test.js");
}

function checkRenderReadiness() {
  const pkg = readJson(path.join(ROOT, "package.json"));
  const start = pkg.scripts?.start || "";
  record("Render start command", start === "node server.js", start || "missing");
  record("config file present", fs.existsSync(path.join(ROOT, "config.json")));
  record("public admin present", fs.existsSync(path.join(ROOT, "public", "admin.html")) && fs.existsSync(path.join(ROOT, "public", "admin.js")));
}

function main() {
  checkEnv();
  checkStorage();
  checkDatabase();
  checkRuntimeDependencies();
  checkDocsAndScripts();
  checkRenderReadiness();

  const failed = results.filter((item) => !item.ok);
  const report = {
    ok: failed.length === 0,
    generatedAt: new Date().toISOString(),
    failedChecks: failed.map((item) => item.name),
    checks: results
  };
  const outDir = path.join(ROOT, "storage", "generated");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "PRODUCTION_CHECK.json"), JSON.stringify(report, null, 2), "utf8");

  if (failed.length) {
    console.error(`PRODUCTION CHECK FAIL: ${failed.length} failed check(s)`);
    process.exit(1);
  }
  console.log("PRODUCTION CHECK PASS");
}

main();
