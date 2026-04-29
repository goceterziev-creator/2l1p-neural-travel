const offerForm = document.getElementById("offerForm");
const offersList = document.getElementById("offersList");
const snapshot = document.getElementById("snapshot");
const clearBtn = document.getElementById("clearBtn");
const formMessage = document.getElementById("formMessage");
const flightsWrapper = document.getElementById("flightsWrapper");
const hotelsWrapper = document.getElementById("hotelsWrapper");
const autoPriceBox = document.getElementById("autoPriceBox");
const priceField = document.getElementById("priceField");
const basePriceField = document.getElementById("basePrice");
const markupPercentField = document.getElementById("markupPercent");
const templateSelect = document.getElementById("templateSelect");
const applyTemplateBtn = document.getElementById("applyTemplateBtn");

const params = new URLSearchParams(window.location.search);
const editId = params.get("edit");
const isNewMode = params.get("new") === "1";

let isEditMode = false;
let flightIndex = 0;
let hotelIndex = 0;

window.currentOffer = null;

const pad = (n) => String(n).padStart(2, "0");

function formatDate(d) {
  const x = new Date(d);
  if (isNaN(x)) return "-";
  return (
    pad(x.getDate()) +
    "." +
    pad(x.getMonth() + 1) +
    "." +
    x.getFullYear() +
    " " +
    pad(x.getHours()) +
    ":" +
    pad(x.getMinutes())
  );
}

function badge(status) {
  return `<span class="badge ${status}">${status}</span>`;
}

function cleanPhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function buildOfferLink(offerId) {
  return `${window.location.origin}/offer/${offerId}`;
}

function buildWhatsAppUrl(phone, offer) {
  const safePhone = cleanPhone(phone);
  const link = buildOfferLink(offer.id);

  const text = `Hello${offer.clientName ? " " + offer.clientName : ""}!

Your travel offer is ready.

Offer ID: ${offer.id}
Destination: ${offer.destination || "TBA"}
Total price: ${Number(offer.finalPrice ?? offer.price || 0).toFixed(2)} ${offer.currency || "EUR"}
Valid until: ${formatDate(offer.validUntil)}

View offer:
${link}

2L1P Neural Travel`;

  return `https://wa.me/${safePhone}?text=${encodeURIComponent(text)}`;
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function collectFlights() {
  const flights = [];

  document.querySelectorAll("#flightsWrapper .builder-card").forEach((card) => {
    const airline = card.querySelector('[data-field="airline"]')?.value?.trim() || "";
    const route = card.querySelector('[data-field="route"]')?.value?.trim() || "";
    const departure = card.querySelector('[data-field="departure"]')?.value?.trim() || "";
    const arrival = card.querySelector('[data-field="arrival"]')?.value?.trim() || "";
    const baggage = card.querySelector('[data-field="baggage"]')?.value?.trim() || "";
    const notes = card.querySelector('[data-field="notes"]')?.value?.trim() || "";
    const price = numberOrZero(card.querySelector('[data-field="price"]')?.value);

    const hasContent = airline || route || departure || arrival || baggage || notes || price > 0;
    if (!hasContent) return;

    flights.push({
      airline,
      route,
      departure,
      arrival,
      baggage,
      notes,
      price
    });
  });

  return flights;
}

function collectHotels() {
  const hotels = [];

  document.querySelectorAll("#hotelsWrapper .builder-card").forEach((card) => {
    const name = card.querySelector('[data-field="name"]')?.value?.trim() || "";
    const stars = card.querySelector('[data-field="stars"]')?.value?.trim() || "";
    const area = card.querySelector('[data-field="area"]')?.value?.trim() || "";
    const distance = card.querySelector('[data-field="distance"]')?.value?.trim() || "";
    const room = card.querySelector('[data-field="room"]')?.value?.trim() || "";
    const meal = card.querySelector('[data-field="meal"]')?.value?.trim() || "";
    const price = numberOrZero(card.querySelector('[data-field="price"]')?.value);
    const roomsLeft = Math.max(
      1,
      numberOrZero(card.querySelector('[data-field="roomsLeft"]')?.value || 1)
    );
    const description = card.querySelector('[data-field="description"]')?.value?.trim() || "";

    const img1 = card.querySelector('[data-field="img1"]')?.value?.trim() || "";
    const img2 = card.querySelector('[data-field="img2"]')?.value?.trim() || "";
    const img3 = card.querySelector('[data-field="img3"]')?.value?.trim() || "";

    const hasContent =
      name || stars || area || distance || room || meal || description || price > 0 || img1 || img2 || img3;

    if (!hasContent) return;

    hotels.push({
      name,
      stars,
      area,
      distance,
      room,
      meal,
      price,
      roomsLeft,
      description,
      images: [img1, img2, img3].filter(Boolean)
    });
  });

  return hotels;
}

function getAutoPriceData() {
  const flights = collectFlights();
  const hotels = collectHotels();

  const flightsTotal = flights.reduce((sum, f) => sum + numberOrZero(f.price), 0);
  const hotelPrices = hotels.map((h) => numberOrZero(h.price)).filter((p) => p > 0);
  const cheapestHotel = hotelPrices.length ? Math.min(...hotelPrices) : 0;

  const manualBase = String(basePriceField?.value || "").trim();
  const manualBaseNumber = numberOrZero(manualBase);

  const sourceBase =
    manualBase !== "" && manualBaseNumber >= 10
      ? manualBaseNumber
      : flightsTotal + cheapestHotel;

  const markupPercent = numberOrZero(markupPercentField?.value);
  const autoFinal = +(sourceBase * (1 + markupPercent / 100)).toFixed(2);

  return {
    flightsTotal,
    cheapestHotel,
    sourceBase,
    markupPercent,
    autoFinal
  };
}

function updateAutoPriceUI() {
  if (!autoPriceBox) return;

  const data = getAutoPriceData();

  autoPriceBox.innerHTML = `
    <b>Auto pricing</b><br>
    Flights total: ${data.flightsTotal.toFixed(2)} EUR<br>
    Cheapest hotel: ${data.cheapestHotel.toFixed(2)} EUR<br>
    Base used: ${data.sourceBase.toFixed(2)} EUR<br>
    Markup: ${data.markupPercent.toFixed(2)}%<br>
    <b>Auto final price: ${data.autoFinal.toFixed(2)} EUR</b>
  `;
}

function bindAutoPriceEvents(scope = document) {
  scope.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", updateAutoPriceUI);
    input.addEventListener("change", updateAutoPriceUI);
  });
}

function createBuilderInput({ placeholder, type = "text", field }) {
  const input = document.createElement("input");
  input.type = type;
  input.placeholder = placeholder;
  input.setAttribute("data-field", field);
  return input;
}

function addFlight(prefill = null) {
  const card = document.createElement("div");
  card.className = "builder-card";

  const head = document.createElement("div");
  head.className = "builder-card-head";
  head.innerHTML = `
    <div class="builder-card-title">Flight Option ${flightIndex + 1}</div>
    <button type="button" class="btn secondary danger-btn">Remove</button>
  `;

  const grid = document.createElement("div");
  grid.className = "builder-grid";

  const fields = [
    { field: "airline", placeholder: "Авиокомпания (Wizz Air)" },
    { field: "route", placeholder: "Маршрут (София → Милано)" },
    { field: "departure", placeholder: "Излитане (25.04.2026 08:30)" },
    { field: "arrival", placeholder: "Кацане (25.04.2026 09:45)" },
    { field: "baggage", placeholder: "Багаж (включен ръчен багаж)" },
    { field: "notes", placeholder: "Бележки (директен полет)" },
    { field: "price", placeholder: "Цена на полета", type: "number" }
  ];

  fields.forEach((cfg) => {
    const el = createBuilderInput(cfg);
    if (prefill && prefill[cfg.field] != null) {
      el.value = prefill[cfg.field];
    }
    grid.appendChild(el);
  });

  card.appendChild(head);
  card.appendChild(grid);
  flightsWrapper.appendChild(card);

  head.querySelector("button").addEventListener("click", () => {
    card.remove();
    updateAutoPriceUI();
  });

  bindAutoPriceEvents(card);
  updateAutoPriceUI();
  flightIndex += 1;
}

function addHotel(prefill = null) {
  const card = document.createElement("div");
  card.className = "builder-card";

  const head = document.createElement("div");
  head.className = "builder-card-head";
  head.innerHTML = `
    <div class="builder-card-title">Hotel Option ${hotelIndex + 1}</div>
    <button type="button" class="btn secondary danger-btn">Remove</button>
  `;

  const grid = document.createElement("div");
  grid.className = "builder-grid";

  const fields = [
    { field: "name", placeholder: "Име на хотел (напр. Есперанто)" },
    { field: "stars", placeholder: "Категория (напр. 4★)" },
    { field: "area", placeholder: "Зона (напр. Централна зона)" },
    { field: "distance", placeholder: "Разстояние (напр. 300 м от центъра)" },
    { field: "room", placeholder: "Тип стая (напр. Двойна стая)" },
    { field: "meal", placeholder: "Хранене (напр. Включена закуска)" },
    { field: "price", placeholder: "Цена на хотела", type: "number" },
    { field: "roomsLeft", placeholder: "Оставащи стаи", type: "number" },
    { field: "description", placeholder: "Кратко описание на хотела" },
    { field: "img1", placeholder: "URL снимка 1" },
    { field: "img2", placeholder: "URL снимка 2" },
    { field: "img3", placeholder: "URL снимка 3" }
  ];

  fields.forEach((cfg) => {
    const el = createBuilderInput(cfg);
    if (prefill) {
      if (cfg.field === "img1") el.value = prefill.images?.[0] || "";
      else if (cfg.field === "img2") el.value = prefill.images?.[1] || "";
      else if (cfg.field === "img3") el.value = prefill.images?.[2] || "";
      else if (prefill[cfg.field] != null) el.value = prefill[cfg.field];
    }
    grid.appendChild(el);
  });

  card.appendChild(head);
  card.appendChild(grid);
  hotelsWrapper.appendChild(card);

  head.querySelector("button").addEventListener("click", () => {
    card.remove();
    updateAutoPriceUI();
  });

  bindAutoPriceEvents(card);
  updateAutoPriceUI();
  hotelIndex += 1;
}

function fillBasicFormFields(o) {
  if (offerForm.clientName) offerForm.clientName.value = o.clientName || "";
  if (offerForm.clientPhone) offerForm.clientPhone.value = o.clientPhone || "";
  if (offerForm.destination) offerForm.destination.value = o.destination || "";
  if (offerForm.flightRoute) offerForm.flightRoute.value = o.flightRoute || "";
  if (offerForm.hotel) offerForm.hotel.value = o.hotel || "";
  if (offerForm.travelDates) offerForm.travelDates.value = o.travelDates || "";
  if (offerForm.guests) offerForm.guests.value = o.guests || "";
  if (offerForm.status) offerForm.status.value = o.status || "draft";
  if (offerForm.basePrice) offerForm.basePrice.value = o.basePrice || "";
  if (offerForm.markupPercent) {
    offerForm.markupPercent.value = o.markupPercent || o.markupPct || "";
  }
  if (offerForm.price) {
    offerForm.price.value =
      o.finalPrice != null && o.finalPrice !== ""
        ? o.finalPrice
        : o.price != null && o.price !== ""
          ? o.price
          : "";
  }
  if (offerForm.currency) offerForm.currency.value = o.currency || "EUR";
  if (offerForm.notes) offerForm.notes.value = o.notes || "";
}

function applyImportedData(data) {
  if (!data) return;

  if (offerForm.destination && !offerForm.destination.value && data.destination) {
    offerForm.destination.value = data.destination;
  }

  if (offerForm.notes && data.notes) {
    const current = offerForm.notes.value || "";
    offerForm.notes.value = current ? `${current}\n\n${data.notes}` : data.notes;
  }

  if (Array.isArray(data.flightOptions) && data.flightOptions.length) {
    const existingFlights = collectFlights();
    if (!existingFlights.length) {
      flightsWrapper.innerHTML = "";
      flightIndex = 0;
    }
    data.flightOptions.forEach((f) => addFlight(f));
  }

  if (Array.isArray(data.hotelOptions) && data.hotelOptions.length) {
    const existingHotels = collectHotels();
    if (!existingHotels.length) {
      hotelsWrapper.innerHTML = "";
      hotelIndex = 0;
    }
    data.hotelOptions.forEach((h) => addHotel(h));
  }

  updateAutoPriceUI();
}

window.importFromUrl = async function () {
  const importUrlField = document.getElementById("importUrl");
  const importBtn = document.getElementById("importBtn");

  const url = String(importUrlField?.value || "").trim();

  if (!url) {
    alert("Paste a URL first.");
    return;
  }

  importBtn.disabled = true;
  importBtn.textContent = "Importing...";

  try {
    const res = await fetch("/api/offers/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.message || "Import failed");
      return;
    }

    applyImportedData(data.data);
    formMessage.textContent = "Imported from URL";
  } catch (err) {
    alert("Import failed");
  } finally {
    importBtn.disabled = false;
    importBtn.textContent = "Import";
  }
};

const TEMPLATES = {
  city_break: {
    notes: "City break offer with flexible hotel options and central location.",
    guests: "2 възрастни",
    markupPercent: 5,
    flights: [
      {
        airline: "Wizz Air",
        route: "София → Дестинация",
        departure: "",
        arrival: "",
        baggage: "Включен ръчен багаж",
        notes: "Директен полет",
        price: 0
      },
      {
        airline: "Wizz Air",
        route: "Дестинация → София",
        departure: "",
        arrival: "",
        baggage: "Включен ръчен багаж",
        notes: "Директен полет",
        price: 0
      }
    ],
    hotels: [
      {
        name: "Central Hotel",
        stars: "4★",
        area: "Централна зона",
        distance: "300 м от центъра",
        room: "Двойна стая",
        meal: "Включена закуска",
        price: 0,
        roomsLeft: 2,
        description: "Комфортен хотел с добра локация и удобен достъп до основните точки в дестинацията.",
        images: ["", "", ""]
      }
    ]
  },
  family_beach: {
    notes: "Family beach offer with child-friendly hotel and easy access to the beach.",
    guests: "2 възрастни + 2 деца",
    markupPercent: 5,
    flights: [
      {
        airline: "Ryanair",
        route: "София → Дестинация",
        departure: "",
        arrival: "",
        baggage: "Включен ръчен багаж",
        notes: "Директен полет",
        price: 0
      },
      {
        airline: "Ryanair",
        route: "Дестинация → София",
        departure: "",
        arrival: "",
        baggage: "Включен ръчен багаж",
        notes: "Директен полет",
        price: 0
      }
    ],
    hotels: [
      {
        name: "Family Resort",
        stars: "4★",
        area: "Близо до плажа",
        distance: "150 м от плажа",
        room: "Фамилна стая",
        meal: "All Inclusive",
        price: 0,
        roomsLeft: 2,
        description: "Подходящ за семейства хотел с лесен достъп до плажа и удобства за деца.",
        images: ["", "", ""]
      }
    ]
  },
  luxury_escape: {
    notes: "Premium luxury offer with curated stay and elevated client presentation.",
    guests: "2 възрастни",
    markupPercent: 8,
    flights: [
      {
        airline: "Aegean",
        route: "София → Дестинация",
        departure: "",
        arrival: "",
        baggage: "Включен ръчен + чекиран багаж",
        notes: "Premium flight option",
        price: 0
      },
      {
        airline: "Aegean",
        route: "Дестинация → София",
        departure: "",
        arrival: "",
        baggage: "Включен ръчен + чекиран багаж",
        notes: "Premium flight option",
        price: 0
      }
    ],
    hotels: [
      {
        name: "Luxury Hotel",
        stars: "5★",
        area: "Premium зона",
        distance: "Първа линия",
        room: "Deluxe Room",
        meal: "Закуска включена",
        price: 0,
        roomsLeft: 1,
        description: "Луксозен хотел с премиум локация, високо ниво на обслужване и силна клиентска презентация.",
        images: ["", "", ""]
      }
    ]
  }
};

function applyTemplate(name) {
  const template = TEMPLATES[name];
  if (!template) return;

  if (offerForm.guests && !offerForm.guests.value) {
    offerForm.guests.value = template.guests || "";
  }

  if (offerForm.notes && !offerForm.notes.value) {
    offerForm.notes.value = template.notes || "";
  }

  if (offerForm.markupPercent && !offerForm.markupPercent.value) {
    offerForm.markupPercent.value = template.markupPercent || 5;
  }

  if (!collectFlights().length) {
    flightsWrapper.innerHTML = "";
    flightIndex = 0;
    (template.flights || []).forEach((f) => addFlight(f));
  }

  if (!collectHotels().length) {
    hotelsWrapper.innerHTML = "";
    hotelIndex = 0;
    (template.hotels || []).forEach((h) => addHotel(h));
  }

  updateAutoPriceUI();
}

async function loadOfferForEdit(id) {
  try {
    const res = await fetch(`/api/offers/${id}/admin`);
    const data = await res.json();

    if (!data.success || !data.offer) {
      formMessage.textContent = "Failed to load offer for edit.";
      return;
    }

    const o = data.offer;
    isEditMode = true;
    window.currentOffer = o;

    const formTitle = document.getElementById("formTitle");
    const submitBtn = document.getElementById("submitBtn");

    if (formTitle) formTitle.textContent = "Edit Offer";
    if (submitBtn) submitBtn.textContent = "Update Offer";

    fillBasicFormFields(o);

    flightsWrapper.innerHTML = "";
    hotelsWrapper.innerHTML = "";
    flightIndex = 0;
    hotelIndex = 0;

    (o.flightOptions || []).forEach((f) => addFlight(f));
    (o.hotelOptions || []).forEach((h) => addHotel(h));

    if (!o.flightOptions || !o.flightOptions.length) addFlight();
    if (!o.hotelOptions || !o.hotelOptions.length) addHotel();

    updateAutoPriceUI();
    formMessage.textContent = `Editing ${o.id}`;
  } catch (err) {
    formMessage.textContent = "Edit load failed.";
  }
}

function offerCard(offer) {
  const link = buildOfferLink(offer.id);
  const whatsappUrl = buildWhatsAppUrl(offer.clientPhone || "", offer);
  const effectiveStatus = offer.effectiveStatus || offer.status || "draft";
  const isClosed = ["booked", "cancelled", "lost", "expired"].includes(effectiveStatus);

  return `
    <div class="offer-card">
      <div class="offer-top">
        <div>
          ${badge(effectiveStatus)}
          <h3 class="offer-title">${offer.destination || "Untitled Offer"}</h3>
          <div class="offer-sub">
            ${offer.flightRoute || "No route"} · ${offer.hotel || "No hotel"} · ${offer.guests || "No guests"}
          </div>
        </div>

        <div class="status-row">
          <select data-id="${offer.id}" class="status-select">
            ${["draft", "sent", "viewed", "booked", "cancelled", "lost", "expired"]
              .map((s) => `<option value="${s}" ${effectiveStatus === s ? "selected" : ""}>${s}</option>`)
              .join("")}
          </select>
        </div>
      </div>

      <div class="price-line">${Number(offer.finalPrice ?? offer.price || 0).toFixed(2)} ${offer.currency || "EUR"}</div>

      <div class="meta-grid">
        <div class="meta-box">
          <div class="label">Offer ID</div>
          <div class="value">${offer.id}</div>
        </div>
        <div class="meta-box">
          <div class="label">Valid Until</div>
          <div class="value">${formatDate(offer.validUntil)}</div>
        </div>
        <div class="meta-box">
          <div class="label">Base Price</div>
          <div class="value">${Number(offer.basePrice || 0).toFixed(2)} ${offer.currency || "EUR"}</div>
        </div>
        <div class="meta-box">
          <div class="label">Markup / Margin</div>
          <div class="value">
            ${Number(offer.markupPercent || offer.markupPct || 0).toFixed(2)}% /
            ${(
              Number(offer.finalPrice ?? offer.price || 0) - Number(offer.basePrice || 0)
            ).toFixed(2)} ${offer.currency || "EUR"}
          </div>
        </div>
      </div>

      <div class="offer-actions">
        <a class="btn secondary" href="/?edit=${offer.id}">Edit</a>
        <a class="btn secondary" href="/offer/${offer.id}" target="_blank">Client Page</a>
        <a class="btn secondary" href="/api/offers/${offer.id}/pdf" target="_blank">PDF</a>
        <a class="btn success" href="${whatsappUrl}" target="_blank">WhatsApp</a>
        ${isClosed ? "" : `<button class="btn success book-offer" data-id="${offer.id}">Book</button>`}
        <button class="btn secondary copy-link" data-link="${link}">Copy Link</button>
      </div>
    </div>
  `;
}

async function loadSnapshot() {
  try {
    const res = await fetch("/api/offers/stats/summary");
    const data = await res.json();
    const s = data.stats || {};

    snapshot.innerHTML = `
      <div class="kpi">
        <div class="label">Total Offers</div>
        <div class="value">${s.totalOffers ?? 0}</div>
      </div>
      <div class="kpi">
        <div class="label">Active Offers</div>
        <div class="value">${s.activeOffers ?? 0}</div>
      </div>
      <div class="kpi">
        <div class="label">Revenue</div>
        <div class="value">${Number(s.totalRevenue || 0).toFixed(2)} EUR</div>
      </div>
      <div class="kpi">
        <div class="label">Margin</div>
        <div class="value">${Number(s.totalMargin || 0).toFixed(2)} EUR</div>
      </div>
    `;
  } catch (err) {
    snapshot.innerHTML = `<div class="empty">Stats unavailable</div>`;
  }
}

async function bookOffer(id) {
  const ok = confirm("Confirm booking?");
  if (!ok) return;

  try {
    const res = await fetch(`/api/offers/${id}/book`, { method: "POST" });
    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.message || "Booking failed");
      return;
    }

    alert("Booking confirmed!");
    loadOffers();
    loadSnapshot();
  } catch (err) {
    alert("Booking failed");
  }
}

async function loadOffers() {
  try {
    const res = await fetch("/api/offers");
    const data = await res.json();
    const offers = data.offers || [];

    if (!offers.length) {
      offersList.innerHTML = '<div class="empty">No offers yet.</div>';
      return;
    }

    offersList.innerHTML = offers.map(offerCard).join("");

    document.querySelectorAll(".copy-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(btn.dataset.link);
        btn.textContent = "Copied";
        setTimeout(() => {
          btn.textContent = "Copy Link";
        }, 1200);
      });
    });

    document.querySelectorAll(".status-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        await fetch(`/api/offers/${sel.dataset.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: sel.value })
        });

        loadOffers();
        loadSnapshot();
      });
    });

    document.querySelectorAll(".book-offer").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await bookOffer(btn.dataset.id);
      });
    });
  } catch (err) {
    offersList.innerHTML = `<div class="empty">Offers unavailable</div>`;
  }
}

function buildPayload() {
  const payload = Object.fromEntries(new FormData(offerForm).entries());

  const flights = collectFlights();
  const hotels = collectHotels();
  const autoData = getAutoPriceData();

  const manualBase = String(payload.basePrice || "").trim();
  const manualPrice = String(payload.price || "").trim();

  const safeAutoBase = autoData.sourceBase > 0 ? autoData.sourceBase : 0;
  const safeAutoFinal = autoData.autoFinal > 0 ? autoData.autoFinal : 0;

  payload.basePrice =
    manualBase !== "" && numberOrZero(manualBase) >= 10
      ? numberOrZero(manualBase)
      : safeAutoBase;

  payload.markupPercent = numberOrZero(payload.markupPercent);

  payload.price =
    manualPrice !== "" && numberOrZero(manualPrice) >= 10
      ? numberOrZero(manualPrice)
      : safeAutoFinal;

  payload.finalPrice = payload.price;
  payload.flightOptions = flights;
  payload.hotelOptions = hotels;

  if (!payload.flightRoute && flights.length) {
    payload.flightRoute = flights.map((f) => f.route).filter(Boolean).join(" | ");
  }

  if (!payload.hotel && hotels.length) {
    payload.hotel = hotels[0].name || "";
  }

  if (!payload.guests || !String(payload.guests).trim()) {
    payload.guests = "2 възрастни";
  }

  return payload;
}

offerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formMessage.textContent = "Saving...";

  const payload = buildPayload();

  try {
    const url =
      isEditMode && window.currentOffer?.id
        ? `/api/offers/${window.currentOffer.id}`
        : "/api/offers";

    const method =
      isEditMode && window.currentOffer?.id
        ? "PATCH"
        : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!data.success) {
      formMessage.textContent = data.message || "Error";
      return;
    }

    formMessage.textContent = isEditMode
      ? `Updated ${data.offer.id}`
      : `Saved ${data.offer.id}`;

    offerForm.reset();

    if (offerForm.currency) offerForm.currency.value = "EUR";
    if (offerForm.validForDays) offerForm.validForDays.value = "1";
    if (offerForm.status) offerForm.status.value = "draft";

    flightsWrapper.innerHTML = "";
    hotelsWrapper.innerHTML = "";
    flightIndex = 0;
    hotelIndex = 0;

    addFlight();
    addHotel();

    window.currentOffer = null;
    isEditMode = false;

    const formTitle = document.getElementById("formTitle");
    const submitBtn = document.getElementById("submitBtn");

    if (formTitle) formTitle.textContent = "Create Offer";
    if (submitBtn) submitBtn.textContent = "Save Offer";

    if (window.location.search.includes("edit=") || window.location.search.includes("new=1")) {
      window.history.replaceState({}, "", "/");
    }

    updateAutoPriceUI();
    loadOffers();
    loadSnapshot();
  } catch (err) {
    formMessage.textContent = "Save failed";
  }
});

clearBtn.addEventListener("click", () => {
  offerForm.reset();

  if (offerForm.currency) offerForm.currency.value = "EUR";
  if (offerForm.validForDays) offerForm.validForDays.value = "1";
  if (offerForm.status) offerForm.status.value = "draft";

  flightsWrapper.innerHTML = "";
  hotelsWrapper.innerHTML = "";
  flightIndex = 0;
  hotelIndex = 0;

  addFlight();
  addHotel();

  formMessage.textContent = "";
  window.currentOffer = null;
  isEditMode = false;

  const formTitle = document.getElementById("formTitle");
  const submitBtn = document.getElementById("submitBtn");

  if (formTitle) formTitle.textContent = "Create Offer";
  if (submitBtn) submitBtn.textContent = "Save Offer";

  if (window.location.search.includes("edit=") || window.location.search.includes("new=1")) {
    window.history.replaceState({}, "", "/");
  }

  updateAutoPriceUI();
});

function sendWhatsApp() {
  if (!window.currentOffer) {
    alert("Save an offer first.");
    return;
  }

  const url = buildWhatsAppUrl(window.currentOffer.clientPhone || "", window.currentOffer);
  window.open(url, "_blank");
}

applyTemplateBtn?.addEventListener("click", () => {
  const value = templateSelect?.value || "";
  if (!value) {
    alert("Choose a template first.");
    return;
  }
  applyTemplate(value);
});

bindAutoPriceEvents(document);

if (isNewMode) {
  if (window.location.search.includes("new=1")) {
    window.history.replaceState({}, "", "/");
  }
}

if (!editId) {
  if (flightsWrapper && !flightsWrapper.children.length) addFlight();
  if (hotelsWrapper && !hotelsWrapper.children.length) addHotel();
}

if (editId) {
  loadOfferForEdit(editId);
}

updateAutoPriceUI();
loadOffers();
loadSnapshot();