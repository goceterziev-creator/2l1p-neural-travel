const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const BASE_URL = process.env.SMOKE_BASE_URL || process.env.LIVE_BASE_URL || "http://localhost:3001";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "demo@aya.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "storage", "generated");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForAdmin(page) {
  await page.waitForSelector("#offersBox", { timeout: 20000 });
  await page.waitForFunction(() => {
    const offersBox = document.querySelector("#offersBox");
    const clientsBox = document.querySelector("#clientsBox");
    return offersBox && clientsBox && !offersBox.textContent.includes("Loading");
  }, { timeout: 20000 });
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.type("#email", ADMIN_EMAIL);
  await page.type("#password", ADMIN_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }),
    page.click("button[type='submit']")
  ]);
  assert(page.url().includes("/admin"), `expected /admin after login, got ${page.url()}`);
  await waitForAdmin(page);
}

async function resetShellState(page) {
  await page.evaluate(() => {
    localStorage.removeItem("gt63_navigation_state_v1");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAdmin(page);
}

async function openOperationalLayers(page) {
  await page.evaluate(() => {
    document.querySelector('[data-ops-panel="clients"]')?.setAttribute("open", "");
  });

  await page.waitForSelector(".offer .primary-action, .kanban-card .primary-action", { timeout: 20000 });

  await page.evaluate(() => {
    const firstOffer = (typeof allOffers !== "undefined" ? allOffers : [])[0];
    if (firstOffer?.id) window.openOfferWorkspace(firstOffer.id);

    const firstClient = typeof buildClientSummaries === "function" ? buildClientSummaries()[0] : null;
    if (firstClient) {
      const key = encodeURIComponent(firstClient.key || `${firstClient.name || ""}|${firstClient.phone || ""}`.toLowerCase());
      window.openClientDrawer(key);
    }

    window.openCommandPalette();
  });

  await page.waitForFunction(() => {
    return document.querySelector("#commandPaletteOverlay")?.classList.contains("open")
      && document.querySelector("#offerWorkspace")?.classList.contains("open");
  }, { timeout: 10000 });
}

async function getLayerState(page) {
  return page.evaluate(() => {
    const z = (selector) => Number(getComputedStyle(document.querySelector(selector)).zIndex) || 0;
    return {
      palette: z("#commandPaletteOverlay"),
      workspace: z("#offerWorkspace"),
      workspaceOverlay: z("#workspaceOverlay"),
      crm: z("#clientDrawer"),
      crmOverlay: z("#drawerOverlay"),
      workspaceOpen: document.querySelector("#offerWorkspace")?.classList.contains("open"),
      paletteOpen: document.querySelector("#commandPaletteOverlay")?.classList.contains("open")
    };
  });
}

async function measureWorkspace(page, width) {
  await page.setViewport({ width, height: 980, deviceScaleFactor: 1 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForFunction(() => document.querySelector("#offerWorkspace")?.classList.contains("open"), { timeout: 10000 });
  return page.evaluate(() => Math.round(document.querySelector("#offerWorkspace").getBoundingClientRect().width));
}

async function checkKanbanDensity(page) {
  await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    window.closeCommandPalette();
    window.setOfferViewMode("kanban");
  });
  await page.waitForSelector(".kanban-card", { timeout: 10000 });
  return page.evaluate(() => {
    const card = document.querySelector(".kanban-card");
    const metaSpan = document.querySelector(".kanban-meta span");
    const board = document.querySelector(".kanban-board");
    return {
      cardWidth: Math.round(card.getBoundingClientRect().width),
      metaDisplay: metaSpan ? getComputedStyle(metaSpan).display : "missing",
      boardClientWidth: Math.round(board.getBoundingClientRect().width),
      boardScrollWidth: board.scrollWidth
    };
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });

    await login(page);
    await resetShellState(page);
    await openOperationalLayers(page);

    const layers = await getLayerState(page);
    assert(layers.palette > layers.workspace, "command palette must be above workspace");
    assert(layers.workspace > layers.crm, "workspace must be above CRM drawer");
    assert(layers.workspaceOverlay > layers.crmOverlay, "workspace backdrop must be above CRM backdrop");
    assert(layers.workspaceOpen && layers.paletteOpen, "workspace and palette should both be open for layer test");

    const mediumWidth = await measureWorkspace(page, 1440);
    const wideWidth = await measureWorkspace(page, 1700);
    const compactWidth = await measureWorkspace(page, 1100);
    assert(wideWidth > mediumWidth, `wide workspace should be wider than medium (${wideWidth} <= ${mediumWidth})`);
    assert(mediumWidth > compactWidth, `medium workspace should be wider than compact (${mediumWidth} <= ${compactWidth})`);

    await page.screenshot({ path: path.join(OUT_DIR, "V8.18_VISUAL_SMOKE_WORKSPACE.png"), fullPage: false });

    const kanban = await checkKanbanDensity(page);
    assert(kanban.metaDisplay === "none", `narrow kanban should hide secondary metadata, got ${kanban.metaDisplay}`);
    assert(kanban.cardWidth > 120, `kanban card width too small: ${kanban.cardWidth}`);

    await page.screenshot({ path: path.join(OUT_DIR, "V8.18_VISUAL_SMOKE_KANBAN_NARROW.png"), fullPage: false });

    console.log("VISUAL SMOKE PASS");
    console.log(JSON.stringify({
      baseUrl: BASE_URL,
      layers,
      workspaceWidths: { compact: compactWidth, medium: mediumWidth, wide: wideWidth },
      kanban,
      screenshots: [
        path.join(OUT_DIR, "V8.18_VISUAL_SMOKE_WORKSPACE.png"),
        path.join(OUT_DIR, "V8.18_VISUAL_SMOKE_KANBAN_NARROW.png")
      ]
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("VISUAL SMOKE FAIL:", error.message);
  process.exit(1);
});
