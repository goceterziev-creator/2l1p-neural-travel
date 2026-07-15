#!/usr/bin/env node

/**
 * GT63 V10.26A Vision JSON Extraction Spike
 *
 * Research-only script. It reads archived regression screenshots, sends them to
 * a Vision API when an API key exists, and writes local comparison reports.
 * It is intentionally not part of npm run qa and never mutates production data.
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(ROOT_DIR, "reports", "vision-spike");
const MAX_CASES = Number(process.env.VISION_SPIKE_LIMIT || 10);
const MAX_SCREENSHOTS_PER_CASE = Number(process.env.VISION_SPIKE_MAX_SCREENSHOTS || 4);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".jfif"]);

function safeReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeReadText(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFileName(value = "") {
  return String(value || "case")
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "case";
}

function getRegressionLibraryRoot() {
  const candidates = [
    process.env.REGRESSION_LIBRARY_DIR,
    path.join("/data", "REGRESSION_LIBRARY"),
    path.join(ROOT_DIR, "storage", "regression-library"),
    path.join(ROOT_DIR, "storage", "generated", "V10_REGRESSION_LIBRARY_TEST")
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(path.join(candidate, "flights"));
    } catch {
      return false;
    }
  }) || path.join(ROOT_DIR, "storage", "regression-library");
}

function listCaseDirectories() {
  const root = getRegressionLibraryRoot();
  const flightsDir = path.join(root, "flights");
  if (!fs.existsSync(flightsDir)) return [];

  return fs.readdirSync(flightsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(flightsDir, entry.name))
    .map((caseDir) => {
      const metadata = safeReadJson(path.join(caseDir, "metadata.json"), {});
      const parsedOutput = safeReadJson(path.join(caseDir, "parsed_output.json"), {});
      const trace = safeReadJson(path.join(caseDir, "trace.json"), {});
      const screenshots = fs.readdirSync(caseDir)
        .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
        .sort()
        .map((file) => path.join(caseDir, file));

      return {
        id: path.basename(caseDir),
        path: caseDir,
        metadata,
        parsedOutput,
        trace,
        screenshots,
        sourceProfile: metadata.sourceProfile || metadata.metadata?.source || "",
        decision: metadata.decision || "",
        route: metadata.route || parsedOutput.flight?.route || parsedOutput.route || "",
        airline: metadata.airline || parsedOutput.flight?.airline || parsedOutput.airline || "",
        price: Number(metadata.price || parsedOutput.flight?.price || parsedOutput.price || 0),
        timestamp: metadata.timestamp || ""
      };
    })
    .filter((item) => item.screenshots.length)
    .sort((a, b) => String(b.timestamp || b.id).localeCompare(String(a.timestamp || a.id)));
}

function selectDiverseCases(cases, limit = MAX_CASES) {
  const selected = [];
  const seenIds = new Set();
  const buckets = [
    (item) => item.decision === "REVIEW" && Number(item.price || 0) <= 0,
    (item) => item.decision === "REVIEW" && /date|time|flight\.dates|flight\.times/i.test(JSON.stringify(item.metadata?.confidence?.risk?.warnings || item.metadata?.metadata?.missingFields || [])),
    (item) => /wizz/i.test(`${item.airline} ${item.sourceProfile} ${item.id}`),
    (item) => /ryanair/i.test(`${item.airline} ${item.sourceProfile} ${item.id}`),
    (item) => /turkish|lufthansa|swiss|austrian/i.test(`${item.airline} ${item.sourceProfile} ${item.id}`),
    (item) => /booking|esky|connecting/i.test(`${item.sourceProfile} ${item.id}`),
    (item) => Number(item.metadata?.screenshotCount || item.screenshots.length) > 1,
    (item) => item.decision === "PASS",
    (item) => item.decision === "REVIEW"
  ];

  function addCase(item) {
    if (!item || seenIds.has(item.id) || selected.length >= limit) return;
    seenIds.add(item.id);
    selected.push(item);
  }

  for (const bucket of buckets) {
    addCase(cases.find((item) => bucket(item)));
  }
  for (const item of cases) {
    addCase(item);
  }

  return selected.slice(0, limit);
}

function imageToApiPart(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".png"
    ? "image/png"
    : ext === ".webp"
      ? "image/webp"
      : "image/jpeg";
  const base64 = fs.readFileSync(filePath).toString("base64");
  return { mimeType, base64, fileName: path.basename(filePath) };
}

function strictPrompt(caseInfo) {
  return [
    "You are extracting structured travel data from flight booking screenshots.",
    "Return ONLY valid JSON. No markdown. No prose.",
    "If a field is not visible, return null or an empty array.",
    "Use IATA airport codes when visible. Do not infer unseen airports.",
    "Use ISO-like local datetime strings only when date and time are visible; otherwise keep the visible partial value or null.",
    "Required JSON schema:",
    JSON.stringify({
      outbound: {
        segments: [
          {
            from: "IATA",
            to: "IATA",
            departure: "YYYY-MM-DDTHH:MM",
            arrival: "YYYY-MM-DDTHH:MM",
            airline: "",
            flightNumber: "",
            duration: ""
          }
        ],
        totalDuration: "",
        stops: 0
      },
      inbound: {
        segments: [
          {
            from: "IATA",
            to: "IATA",
            departure: "YYYY-MM-DDTHH:MM",
            arrival: "YYYY-MM-DDTHH:MM",
            airline: "",
            flightNumber: "",
            duration: ""
          }
        ],
        totalDuration: "",
        stops: 0
      },
      price: 0,
      currency: "",
      baggage: "",
      passengers: 0,
      dates: []
    }, null, 2),
    "Existing parser context for comparison only:",
    JSON.stringify({
      archivedRoute: caseInfo.route || null,
      archivedAirline: caseInfo.airline || null,
      archivedPrice: caseInfo.price || null,
      decision: caseInfo.decision || null,
      sourceProfile: caseInfo.sourceProfile || null
    }, null, 2)
  ].join("\n\n");
}

async function callOpenAiVision(caseInfo, images) {
  const content = [
    { type: "text", text: strictPrompt(caseInfo) },
    ...images.map((image) => ({
      type: "image_url",
      image_url: {
        url: `data:${image.mimeType};base64,${image.base64}`
      }
    }))
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.VISION_SPIKE_OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content
        }
      ],
      temperature: 0
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI Vision request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

async function callGeminiVision(caseInfo, images) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.VISION_SPIKE_GEMINI_MODEL || "gemini-2.0-flash"}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json"
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: strictPrompt(caseInfo) },
            ...images.map((image) => ({
              inlineData: {
                mimeType: image.mimeType,
                data: image.base64
              }
            }))
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini Vision request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}";
  return JSON.parse(text);
}

function routeFromVision(vision = {}) {
  const outbound = Array.isArray(vision.outbound?.segments) ? vision.outbound.segments : [];
  const inbound = Array.isArray(vision.inbound?.segments) ? vision.inbound.segments : [];
  const outboundFrom = outbound[0]?.from || "";
  const outboundTo = outbound[outbound.length - 1]?.to || "";
  const inboundFrom = inbound[0]?.from || "";
  const inboundTo = inbound[inbound.length - 1]?.to || "";
  if (outboundFrom && outboundTo && inboundFrom && inboundTo) {
    return `${outboundFrom} -> ${outboundTo} / ${inboundFrom} -> ${inboundTo}`;
  }
  if (outboundFrom && outboundTo) return `${outboundFrom} -> ${outboundTo}`;
  return "";
}

function normalizeRoute(value = "") {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\s*->\s*/g, " -> ")
    .replace(/\s*\/\s*/g, " / ")
    .trim();
}

function normalizePrice(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
}

function compareCase(caseInfo, vision) {
  const parserRoute = caseInfo.route || caseInfo.parsedOutput?.flight?.route || caseInfo.parsedOutput?.route || "";
  const visionRoute = routeFromVision(vision);
  const parserPrice = normalizePrice(caseInfo.price || caseInfo.parsedOutput?.flight?.price || caseInfo.parsedOutput?.price);
  const visionPrice = normalizePrice(vision.price);
  const outboundCount = Array.isArray(vision.outbound?.segments) ? vision.outbound.segments.length : 0;
  const inboundCount = Array.isArray(vision.inbound?.segments) ? vision.inbound.segments.length : 0;

  return {
    id: caseInfo.id,
    decision: caseInfo.decision || "",
    sourceProfile: caseInfo.sourceProfile || "",
    screenshots: caseInfo.screenshots.map((filePath) => path.basename(filePath)),
    routeMatch: Boolean(parserRoute && visionRoute && normalizeRoute(parserRoute) === normalizeRoute(visionRoute)),
    parserRoute,
    visionRoute,
    priceMatch: parserPrice > 0 && visionPrice > 0 && Math.abs(parserPrice - visionPrice) < 0.01,
    parserPrice,
    visionPrice,
    datesPresent: Array.isArray(vision.dates) && vision.dates.length > 0,
    segmentsCount: outboundCount + inboundCount,
    outboundSegments: outboundCount,
    inboundSegments: inboundCount,
    airlinePresent: [
      ...(Array.isArray(vision.outbound?.segments) ? vision.outbound.segments : []),
      ...(Array.isArray(vision.inbound?.segments) ? vision.inbound.segments : [])
    ].some((segment) => String(segment.airline || "").trim()),
    parserResult: {
      airline: caseInfo.airline || "",
      route: parserRoute,
      price: parserPrice,
      decision: caseInfo.decision || ""
    },
    visionResult: vision,
    notes: []
  };
}

function writeSummary(results, provider, root) {
  const summary = {
    timestamp: new Date().toISOString(),
    provider,
    regressionRoot: root,
    casesTested: results.length,
    routeMatches: results.filter((item) => item.routeMatch).length,
    priceMatches: results.filter((item) => item.priceMatch).length,
    datesPresent: results.filter((item) => item.datesPresent).length,
    segmentCoverage: results.map((item) => ({
      id: item.id,
      segmentsCount: item.segmentsCount,
      outboundSegments: item.outboundSegments,
      inboundSegments: item.inboundSegments
    })),
    results: results.map((item) => ({
      id: item.id,
      decision: item.decision,
      routeMatch: item.routeMatch,
      priceMatch: item.priceMatch,
      datesPresent: item.datesPresent,
      segmentsCount: item.segmentsCount,
      airlinePresent: item.airlinePresent,
      parserResult: item.parserResult,
      visionRoute: item.visionRoute,
      visionPrice: item.visionPrice
    }))
  };

  const jsonPath = path.join(REPORT_DIR, "summary.json");
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");

  const md = [
    "# V10.26A Vision JSON Extraction Spike",
    "",
    `Provider: ${provider}`,
    `Cases tested: ${results.length}`,
    `Route matches: ${summary.routeMatches}/${results.length}`,
    `Price matches: ${summary.priceMatches}/${results.length}`,
    `Dates present: ${summary.datesPresent}/${results.length}`,
    "",
    "| Case | Decision | Route match | Price match | Dates | Segments | Airline |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((item) => [
      sanitizeFileName(item.id),
      item.decision || "-",
      item.routeMatch ? "YES" : "NO",
      item.priceMatch ? "YES" : "NO",
      item.datesPresent ? "YES" : "NO",
      String(item.segmentsCount),
      item.airlinePresent ? "YES" : "NO"
    ].join(" | ")).map((row) => `| ${row} |`)
  ].join("\n");
  const mdPath = path.join(REPORT_DIR, "summary.md");
  fs.writeFileSync(mdPath, md, "utf8");

  return { jsonPath, mdPath, summary };
}

async function main() {
  if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
    console.log("Vision spike skipped: no API key configured.");
    console.log("Set OPENAI_API_KEY or GEMINI_API_KEY, then run: node scripts/v10.26a-vision-spike.js");
    return;
  }

  const provider = OPENAI_API_KEY ? "openai" : "gemini";
  const root = getRegressionLibraryRoot();
  const cases = selectDiverseCases(listCaseDirectories(), MAX_CASES);

  if (!cases.length) {
    console.log(`Vision spike skipped: no archived flight screenshots found under ${root}`);
    return;
  }

  ensureDir(REPORT_DIR);

  const results = [];
  for (const caseInfo of cases) {
    const images = caseInfo.screenshots
      .slice(0, MAX_SCREENSHOTS_PER_CASE)
      .map(imageToApiPart);
    const safeId = sanitizeFileName(caseInfo.id);
    const caseReportDir = path.join(REPORT_DIR, safeId);
    ensureDir(caseReportDir);

    console.log(`Vision spike: ${provider} -> ${caseInfo.id} (${images.length} screenshot(s))`);
    const vision = provider === "openai"
      ? await callOpenAiVision(caseInfo, images)
      : await callGeminiVision(caseInfo, images);
    const comparison = compareCase(caseInfo, vision);

    fs.writeFileSync(path.join(caseReportDir, "vision_result.json"), JSON.stringify(vision, null, 2), "utf8");
    fs.writeFileSync(path.join(caseReportDir, "comparison.json"), JSON.stringify(comparison, null, 2), "utf8");
    fs.writeFileSync(path.join(caseReportDir, "case_manifest.json"), JSON.stringify({
      id: caseInfo.id,
      path: caseInfo.path,
      screenshots: caseInfo.screenshots.map((filePath) => path.basename(filePath)),
      metadata: caseInfo.metadata,
      parsedOutput: caseInfo.parsedOutput
    }, null, 2), "utf8");

    results.push(comparison);
  }

  const { jsonPath, mdPath, summary } = writeSummary(results, provider, root);
  console.log("Vision spike complete.");
  console.log(`Cases tested: ${summary.casesTested}`);
  console.log(`Route matches: ${summary.routeMatches}/${summary.casesTested}`);
  console.log(`Price matches: ${summary.priceMatches}/${summary.casesTested}`);
  console.log(`Dates present: ${summary.datesPresent}/${summary.casesTested}`);
  console.log(`Reports written locally: ${jsonPath}`);
  console.log(`Markdown summary: ${mdPath}`);
}

main().catch((error) => {
  console.error("Vision spike failed:", error.message);
  process.exitCode = 1;
});
