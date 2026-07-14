const { spawn } = require("child_process");

const PORT = process.env.QA_PORT || process.env.PORT || "3920";
const BASE_URL = process.env.SMOKE_BASE_URL || process.env.LIVE_BASE_URL || `http://localhost:${PORT}`;
const CHECK_TARGETS = [
  "server.js",
  "public/admin.js",
  "gt63-core/smart-import-consumer-adapter.js",
  "gt63-core/core-data-provider.js",
  "gt63-core/proposal-input-adapter.js",
  "gt63-core/luxury-v11-renderer.js",
  "gt63-core/product/app.js",
  "scripts/v10-persistence-safety-check.js",
  "scripts/smart-import-consumer-adapter-regression.js",
  "scripts/proposal-input-adapter-regression.js",
  "scripts/luxury-v11-renderer-regression.js",
  "scripts/gt63-core-e2e-smoke.js",
  "scripts/v10-flight-ocr-regression.js",
  "scripts/smoke-test.js",
  "scripts/v9-architecture-check.js",
  "scripts/v9-boundary-test.js"
];

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      env: { ...process.env, ...options.env }
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${process.execPath} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function healthCheck() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth() {
  for (let i = 0; i < 90; i += 1) {
    if (await healthCheck()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server did not become healthy at ${BASE_URL}/api/health`);
}

function startServer() {
  return spawn(process.execPath, ["server.js"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      PORT,
      LIVE_BASE_URL: BASE_URL,
      SMOKE_BASE_URL: BASE_URL
    }
  });
}

async function main() {
  for (const target of CHECK_TARGETS) {
    await runNode(["--check", target]);
  }

  let server = null;
  if (!(await healthCheck())) {
    server = startServer();
    await waitForHealth();
  }

  try {
    await runNode(["scripts/smart-import-consumer-adapter-regression.js"]);
    await runNode(["scripts/proposal-input-adapter-regression.js"]);
    await runNode(["scripts/luxury-v11-renderer-regression.js"]);
    await runNode(["scripts/gt63-core-e2e-smoke.js"]);
    await runNode(["scripts/v10-flight-ocr-regression.js"]);
    await runNode(["scripts/v10-persistence-safety-check.js"]);
    await runNode(["scripts/smoke-test.js"], { env: { SMOKE_BASE_URL: BASE_URL } });
    await runNode(["scripts/v9-architecture-check.js"]);
  } finally {
    if (server) server.kill();
  }
}

main().catch((error) => {
  console.error(`QA FAIL: ${error.message}`);
  process.exit(1);
});
