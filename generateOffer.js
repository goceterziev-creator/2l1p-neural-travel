const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const puppeteer = require("puppeteer");

function calculateNights(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = end - start;
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(amount, currency = "EUR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}

function buildWhatsAppLink(phone, text) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

function buildFlightLabel(adults, childrenCount) {
  if (childrenCount === 1) {
    return `Самолетни билети за ${adults} възрастни + 1 дете`;
  }
  if (childrenCount > 1) {
    return `Самолетни билети за ${adults} възрастни + ${childrenCount} деца`;
  }
  return `Самолетни билети за ${adults} възрастни`;
}

function buildTravelersLabel(adults, childrenCount) {
  if (childrenCount === 0) {
    return `${adults} възрастни`;
  }
  if (childrenCount === 1) {
    return `${adults} възрастни + 1 дете`;
  }
  return `${adults} възрастни + ${childrenCount} деца`;
}

function roundPrice(value) {
  return Math.round(value / 10) * 10;
}

function calculatePackagePrice({
  nights,
  adults,
  childrenCount,
  hotelPerNight,
  adultFlight,
  childFlight,
  transfers = 0,
  experiences = 0,
  markupPct = 0
}) {
  const hotelTotal = nights * hotelPerNight;
  const flightsTotal = adults * adultFlight + childrenCount * childFlight;
  const subtotal = hotelTotal + flightsTotal + transfers + experiences;
  const finalTotal = subtotal * (1 + markupPct / 100);
  return roundPrice(finalTotal);
}

function getHotelZones(destination = "") {
  const d = String(destination).toLowerCase();

  if (d.includes("dubai")) {
    return ["Dubai Marina", "Downtown Dubai", "Palm Jumeirah"];
  }
  if (d.includes("tokyo")) {
    return ["Shinjuku", "Ginza", "Tokyo Station Area"];
  }
  if (d.includes("paros")) {
    return ["Parikia", "Naousa", "Golden Beach"];
  }
  if (d.includes("milano") || d.includes("milan")) {
    return ["Duomo", "Porta Nuova", "Navigli"];
  }

  return ["Central Area", "Best Location", "Recommended Zone"];
}

function getExperiences(destination = "") {
  const d = String(destination).toLowerCase();

  if (d.includes("dubai")) {
    return [
      "Dubai highlights с балансирано темпо за семейство",
      "Beach / Marina ден с по-лек график",
      "Шопинг / свободно време / optional desert experience"
    ];
  }

  if (d.includes("tokyo")) {
    return [
      "Tokyo highlights с балансирано темпо за семейство",
      "Family-friendly ден с по-лек график",
      "Шопинг / свободно време / optional experience"
    ];
  }

  if (d.includes("paros")) {
    return [
      "Разходка из Parikia и Naousa",
      "Плажен ден с по-лек график",
      "Свободно време / optional boat experience"
    ];
  }

  if (d.includes("milano") || d.includes("milan")) {
    return [
      "City highlights и централна разходка",
      "Шопинг / свободно време",
      "Optional day experience"
    ];
  }

  return [
    "Основни акценти според дестинацията",
    "Баланс между почивка и логистика",
    "Optional experience според бюджета"
  ];
}

function getTagline(destination = "") {
  const d = String(destination).toLowerCase();

  if (d.includes("dubai")) {
    return "Семейно пътуване с комфорт, добра локация и лесна логистика";
  }
  if (d.includes("paros")) {
    return "Спокойна островна почивка с добра локация, плажове и лесна организация";
  }
  if (d.includes("tokyo")) {
    return "Градско пътуване с балансирана програма, добра локация и удобна логистика";
  }
  if (d.includes("milano") || d.includes("milan")) {
    return "Стилен city break с централна локация, удобни връзки и добър ритъм";
  }

  return "Подбрано пътуване с комфорт, добра локация и ясна организация";
}

function renderHtml(offer, whatsappLink) {
  return `
<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(offer.destination)} Offer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #eef2f7; color: #1c2430; }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .hero {
      background: linear-gradient(135deg, #0c2461, #1e3799 55%, #4a69bd);
      color: white;
      border-radius: 28px;
      padding: 40px;
      box-shadow: 0 20px 50px rgba(12, 36, 97, 0.25);
      margin-bottom: 24px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .eyebrow { opacity: 0.85; font-size: 14px; letter-spacing: 0.08em; margin-bottom: 12px; text-transform: uppercase; }
    h1 { font-size: 44px; margin-bottom: 14px; }
    .sub { font-size: 18px; opacity: 0.95; max-width: 760px; margin-bottom: 22px; }
    .meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 22px; }
    .pill { background: rgba(255,255,255,0.12); padding: 12px 16px; border-radius: 999px; font-size: 14px; }
    .hero-bottom { display: flex; justify-content: space-between; align-items: end; gap: 24px; flex-wrap: wrap; }
    .from-price { font-size: 34px; font-weight: bold; }
    .cta {
      display: inline-block;
      background: #ff9a00;
      color: white;
      padding: 14px 22px;
      border-radius: 14px;
      text-decoration: none;
      font-weight: bold;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
    .card {
      background: white;
      border-radius: 24px;
      padding: 28px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.06);
      margin-bottom: 24px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    h2 { font-size: 24px; margin-bottom: 16px; }
    h1, h2, h3 {
      break-after: avoid;
      page-break-after: avoid;
    }
    .packages {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .package-card {
      border: 1px solid #e8ecf2;
      border-radius: 20px;
      padding: 22px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .package-card.recommended { border: 2px solid #ff9a00; box-shadow: 0 10px 25px rgba(255,154,0,0.14); }
    .package-head { display: flex; justify-content: space-between; gap: 16px; align-items: start; margin-bottom: 14px; }
    .badge { font-size: 13px; color: #5d6b82; margin-top: 6px; }
    .price { font-size: 28px; font-weight: bold; color: #0c2461; white-space: nowrap; }
    ul { padding-left: 18px; display: grid; gap: 10px; }
    .side-box {
      background: #f8fafc;
      border-radius: 18px;
      padding: 18px;
      margin-bottom: 16px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .muted { color: #5d6b82; line-height: 1.6; }
    .contact { background: #0c2461; color: white; }
    .contact .muted { color: rgba(255,255,255,0.8); }
    .foot { text-align: center; color: #5d6b82; padding: 10px 0 30px; font-size: 14px; }

    @page {
      size: A4;
      margin: 12mm;
    }

    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
      h1 { font-size: 34px; }
    }

    @media print {
      body { background: white; }
      .wrap { max-width: 100%; padding: 0; }
      .grid { grid-template-columns: 1fr; }

      .hero,
      .card,
      .package-card,
      .side-box,
      .cta {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .packages { display: block; }
      .package-card { margin-bottom: 16px; }
      .foot { padding-bottom: 0; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="eyebrow">${escapeHtml(offer.brandName)} · Family Offer</div>
      <h1>${escapeHtml(offer.destination)}</h1>
      <p class="sub">${escapeHtml(offer.tagline)}</p>

      <div class="meta">
        <div class="pill">${escapeHtml(offer.datesLabel)}</div>
        <div class="pill">${escapeHtml(offer.travelersLabel)}</div>
        <div class="pill">${offer.nights} нощувки</div>
        <div class="pill">Отпътуване: ${escapeHtml(offer.departureAirport)}</div>
      </div>

      <div class="hero-bottom">
        <div>
          <div class="muted" style="color: rgba(255,255,255,0.82)">Семейна логистика · хотел · полети · предложение</div>
          <div class="from-price">от ${formatMoney(offer.packages[0].price, offer.currency)}</div>
          <div class="muted" style="color: rgba(255,255,255,0.82); margin-top: 8px;">
            Офертата е ориентировъчна и е препоръчително потвърждение до ${offer.validHours} часа.
          </div>
          <div class="muted" style="color: rgba(255,255,255,0.82); margin-top: 6px;">
            Валидна до: ${escapeHtml(offer.validUntilLabel)}
          </div>
        </div>

        <a class="cta" href="${whatsappLink}" target="_blank" rel="noopener">Резервирай чрез WhatsApp</a>
      </div>
    </section>

    <div class="grid">
      <div>
        <section class="card">
          <h2>Пакети</h2>
          <div class="packages">
            ${offer.packages.map(pkg => `
              <div class="package-card ${pkg.key === offer.recommendedPackage ? "recommended" : ""}">
                <div class="package-head">
                  <div>
                    <h3>${escapeHtml(pkg.name)}</h3>
                    <div class="badge">${escapeHtml(pkg.badge)}</div>
                  </div>
                  <div class="price">${formatMoney(pkg.price, offer.currency)}</div>
                </div>
                <ul>
                  ${pkg.features.map(feature => `<li>${escapeHtml(feature)}</li>`).join("")}
                </ul>
              </div>
            `).join("")}
          </div>
        </section>

        <section class="card">
          <h2>Следваща стъпка</h2>
          <p class="muted" style="margin-bottom: 16px;">
            Потвърдете в WhatsApp, за да подготвим финална версия с хотел, полети и актуална цена.
          </p>
          <a class="cta" href="${whatsappLink}" target="_blank" rel="noopener">Резервирай чрез WhatsApp</a>
        </section>
      </div>

      <div>
        <section class="card">
          <h2>Trip Summary</h2>
          <div class="side-box">
            <strong>Пътуващи</strong>
            <div class="muted">${escapeHtml(offer.travelersLabel)}</div>
            <div class="muted">${escapeHtml(offer.childrenLabel)}</div>
          </div>

          <div class="side-box">
            <strong>Подходящи зони за хотел</strong>
            <div class="muted">${offer.hotelZones.map(escapeHtml).join(" · ")}</div>
          </div>

          <div class="side-box">
            <strong>Ключови преживявания</strong>
            <div class="muted">${offer.experiences.map(escapeHtml).join(" · ")}</div>
          </div>
        </section>

        <section class="card contact">
          <h2>Контакт</h2>
          <p class="muted">
            Потвърдете в WhatsApp, за да подготвим финална версия с хотел, полети и актуална цена.
          </p>
          <p style="margin-top: 16px;"><strong>WhatsApp:</strong> ${escapeHtml(offer.contactPhone)}</p>
        </section>
      </div>
    </div>

    <div class="foot">${escapeHtml(offer.brandName)} · Generated offer ${escapeHtml(offer.id)}</div>
  </div>
</body>
</html>
`.trim();
}

function generateOffer(input, options = {}) {
  const startDate = input.startDate || "2026-03-28";
  const endDate = input.endDate || "2026-04-12";
  const adults = Number(input.adults || 2);
  const children = Array.isArray(input.children) ? input.children : [];
  const nights = calculateNights(startDate, endDate);
  const childrenCount = children.length;
  const destination = input.destination || "Tokyo, Japan";
  const validHours = Number(input.validHours || 24);

  const validUntilDate = new Date(Date.now() + validHours * 60 * 60 * 1000);
  const validUntilIso = validUntilDate.toISOString();
  const validUntilLabel = validUntilDate.toLocaleString("bg-BG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  const premiumPrice = calculatePackagePrice({
    nights,
    adults,
    childrenCount,
    hotelPerNight: 160,
    adultFlight: 280,
    childFlight: 190,
    transfers: 90,
    experiences: 0,
    markupPct: 8
  });

  const luxuryPrice = calculatePackagePrice({
    nights,
    adults,
    childrenCount,
    hotelPerNight: 240,
    adultFlight: 340,
    childFlight: 230,
    transfers: 140,
    experiences: 120,
    markupPct: 10
  });

  const vipPrice = calculatePackagePrice({
    nights,
    adults,
    childrenCount,
    hotelPerNight: 390,
    adultFlight: 520,
    childFlight: 320,
    transfers: 260,
    experiences: 260,
    markupPct: 12
  });

  const offer = {
    id: input.id || `OFF-${Date.now()}`,
    destination,
    startDate,
    endDate,
    departureAirport: input.departureAirport || "Sofia",
    adults,
    children,
    currency: input.currency || "EUR",
    validHours,
    validUntil: validUntilIso,
    validUntilLabel,
    contactPhone: input.contactPhone || "+359894842882",
    contactWhatsApp: input.contactWhatsApp || "+359894842882",
    brandName: input.brandName || "AYA Offer Engine",
    nights,
    tagline: getTagline(destination),
    hotelZones: getHotelZones(destination),
    experiences: getExperiences(destination),
    packages: [
      {
        key: "premium",
        name: "PREMIUM",
        price: premiumPrice,
        badge: "Най-добра стойност",
        features: [
          `${nights} нощувки в 3.5★ / 4★ хотел`,
          "Семейна стая или свързани стаи",
          buildFlightLabel(adults, childrenCount),
          "Багаж + базови трансфери",
          `Примерен план за престоя в ${destination}`
        ]
      },
      {
        key: "luxury",
        name: "LUXURY",
        price: luxuryPrice,
        badge: "Препоръчан вариант",
        features: [
          `${nights} нощувки в 4★ / 4.5★ хотел`,
          "По-централна зона и по-лесна логистика",
          "По-удобни полети за семейно пътуване",
          "Частен летищен трансфер",
          "1 family experience включено"
        ]
      },
      {
        key: "vip",
        name: "VIP FAMILY",
        price: vipPrice,
        badge: "Максимален комфорт",
        features: [
          `${nights} нощувки в 5★ хотел / family suite`,
          "Premium routing и private transfers",
          "Персонализирана day-by-day програма",
          "Консиерж съдействие",
          "2 family experiences включени"
        ]
      }
    ],
    recommendedPackage: "luxury",
    datesLabel: `${startDate} – ${endDate}`,
    travelersLabel: buildTravelersLabel(adults, childrenCount),
    childrenLabel: children.length
      ? children.map((c, i) => `Дете ${i + 1}: ${c.age} г.`).join(" · ")
      : "Без деца"
  };

  const baseUrl = options.clientBaseUrl || "https://twol1p-neural-travel-1.onrender.com/api/offers/view";
  const clientUrl = `${baseUrl}/${offer.id}`;

  const whatsappText = `Здравейте 👋

Подготвихме вашата оферта за ${offer.destination} за периода ${offer.datesLabel}.

Пътуващи: ${offer.travelersLabel}
Нощувки: ${offer.nights}
Стартова цена: ${formatMoney(offer.packages[0].price, offer.currency)}
Валидна до: ${offer.validUntilLabel}

Разгледайте офертата тук:
${clientUrl}

При желание можем да коригираме хотела, полетите или бюджета и да изпратим обновена версия.`;

  const whatsappLink = buildWhatsAppLink(offer.contactWhatsApp, whatsappText);
  const html = renderHtml(offer, whatsappLink);

  return {
    offer,
    html,
    pdfData: {
      DESTINATION: offer.destination,
      DATES: offer.datesLabel,
      TRAVELERS: offer.travelersLabel
    },
    whatsappText,
    whatsappLink,
    clientUrl
  };
}

async function savePdfOffer(result, htmlPath, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const pdfPath = path.join(outputDir, `${result.offer.id}.pdf`);
  const browser = await puppeteer.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: "networkidle0"
    });

    await page.emulateMediaType("screen");

    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "12mm",
        right: "12mm",
        bottom: "12mm",
        left: "12mm"
      }
    });

    return { pdfPath };
  } finally {
    await browser.close();
  }
}

async function saveGeneratedOffer(result, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const htmlPath = path.join(outputDir, `${result.offer.id}.html`);
  const jsonPath = path.join(outputDir, `${result.offer.id}.json`);

  fs.writeFileSync(htmlPath, result.html, "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        offer: result.offer,
        pdfData: result.pdfData,
        whatsappText: result.whatsappText,
        whatsappLink: result.whatsappLink,
        clientUrl: result.clientUrl
      },
      null,
      2
    ),
    "utf8"
  );

  const pdfSaved = await savePdfOffer(result, htmlPath, outputDir);

  return {
    htmlPath,
    jsonPath,
    pdfPath: pdfSaved.pdfPath
  };
}

module.exports = {
  generateOffer,
  saveGeneratedOffer
};