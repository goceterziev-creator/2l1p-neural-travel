const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname, "..", "server.js");
const source = fs.readFileSync(serverPath, "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const readDbMatch = source.match(/function readDb\(\) \{[\s\S]*?\n\}/);
assert(readDbMatch, "readDb function not found");
assert(!readDbMatch[0].includes("return { users: [], offers: [] }"), "readDb must not silently return an empty database on failure");
assert(readDbMatch[0].includes("recoverDbSnapshot()"), "readDb must attempt backup recovery before failing");
assert(readDbMatch[0].includes("throw err"), "readDb must fail closed when recovery fails");

const writeDbStart = source.indexOf("function writeDb(db)");
const mutateDbStart = source.indexOf("let mutationQueue");
assert(writeDbStart !== -1 && mutateDbStart !== -1 && mutateDbStart > writeDbStart, "writeDb/mutateDb persistence block not found");
const writeDbBlock = source.slice(writeDbStart, mutateDbStart);
assert(writeDbBlock.includes("fs.writeFileSync(tmp, payload"), "writeDb must write to a temp file first");
assert(writeDbBlock.includes("readDbSnapshotFile(tmp)"), "writeDb must validate temp JSON before rename");
assert(writeDbBlock.includes("fs.renameSync(tmp, DB_FILE)"), "writeDb must replace the database with rename");
assert(!writeDbBlock.includes("fs.writeFileSync(DB_FILE, payload"), "writeDb must not fall back to unsafe direct writes");
assert(writeDbBlock.includes("throw err"), "writeDb must throw when atomic write fails");

const mutateDbBlock = source.slice(mutateDbStart, source.indexOf("function routeError", mutateDbStart));
assert(mutateDbBlock.includes("let mutationQueue = Promise.resolve()"), "mutateDb queue must start resolved");
assert(mutateDbBlock.includes("mutationQueue = job.catch(() => {})"), "mutateDb queue must recover after failed jobs");
assert(mutateDbBlock.includes("const db = readDb()"), "mutateDb must read inside the queued job");
assert(mutateDbBlock.includes("writeDb(nextDb)"), "mutateDb must write inside the queued job");

const requiredRoutePatterns = [
  /app\.post\("\/api\/admin\/reset-password"[\s\S]*?await mutateDb/,
  /app\.post\("\/api\/agency\/invites"[\s\S]*?await mutateDb/,
  /app\.post\("\/api\/offers"[\s\S]*?await mutateDb/,
  /app\.put\("\/api\/offers\/:id"[\s\S]*?await mutateDb/,
  /app\.patch\("\/api\/offers\/:id\/status"[\s\S]*?await mutateDb/,
  /app\.patch\("\/api\/offers\/:id\/warnings"[\s\S]*?await mutateDb/,
  /app\.post\("\/api\/offers\/:id\/click"[\s\S]*?await mutateDb/,
  /app\.post\("\/api\/offers\/:id\/book"[\s\S]*?await mutateDb/,
  /app\.get\("\/api\/offers\/view\/:id"[\s\S]*?await mutateDb/
];

for (const pattern of requiredRoutePatterns) {
  assert(pattern.test(source), `Required mutation route is not wrapped with mutateDb: ${pattern}`);
}

console.log("ok V10 persistence safety contract");
