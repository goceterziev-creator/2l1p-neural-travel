let editingOfferId = null;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);

  let data = null;
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }

    const message =
      data?.details?.error?.message ||
      data?.details?.message ||
      data?.error ||
      data?.message ||
      `HTTP ${res.status}`;

    throw new Error(message);
  }

  return data;
}

async function loadCurrentUser() {
  try {
    const data = await fetchJson("/api/auth/me");
    const user = data.user || {};
    if ($("currentUser")) {
      $("currentUser").textContent = `${user.name || user.email || "User"} · ${user.plan || "PLAN"}`;
    }
  } catch (error) {
    console.error("User load error:", error);
  }
}

async function logout() {
  try {
    await fetchJson("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.href = "/login";
  }
}

function $(id) {
  return document.getElementById(id);
}

function num(id) {
  return Number($(id)?.value || 0);
}

function formatPrice(value, currency = "EUR") {
  return `${Number(value || 0).toFixed(2)} ${currency}`;
}

function splitLines(text) {
  return String(text || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function calculatePricing() {
  const flight = num("flightPrice");
  const hotel = num("hotelPrice");
  const transfer = num("transferPrice");
  const markup = num("markupPercent");
  const currency = $("currency")?.value || "EUR";

  const base = flight + hotel + transfer;
  const autoFinal = base + base * (markup / 100);
  const override = $("finalPrice")?.value ? Number($("finalPrice").value) : 0;
  const final = override > 0 ? override : autoFinal;
  const profit = final - base;

  if ($("basePrice")) {
    $("basePrice").value = base.toFixed(2);
  }

  if ($("pricingPreview")) {
    $("pricingPreview").innerHTML = `
      <div><strong>Base:</strong> ${formatPrice(base, currency)}</div>
      <div><strong>Final:</strong> ${formatPrice(final, currency)}</div>
      <div><strong>Profit:</strong> ${formatPrice(profit, currency)}</div>
    `;
  }

  return { base, final, profit };
}

async function loadStats() {
  try {
    const stats = await fetchJson("/api/offers/stats/summary");

    $("statTotal").textContent = stats.totalOffers || 0;
    $("statActive").textContent = stats.activeOffers || 0;
    $("statRevenue").textContent = formatPrice(stats.revenuePotential || 0);
    $("statMargin").textContent = formatPrice(stats.marginPotential || 0);
    $("statBooked").textContent = formatPrice(stats.bookedRevenue || 0);
    $("statLost").textContent = formatPrice(stats.lostRevenue || 0);
  } catch (error) {
    console.error("Stats error:", error);
  }
}

function getOfferFlightPrice(offer) {
  if (Number(offer.flightPrice || 0) > 0) return Number(offer.flightPrice || 0);

  const flights = Array.isArray(offer.flights)
    ? offer.flights
    : Array.isArray(offer.flightOptions)
    ? offer.flightOptions
    : [];

  return flights.reduce((sum, f) => sum + Number(f.price || 0), 0);
}

function getOfferHotelPrice(offer) {
  if (Number(offer.hotelPrice || 0) > 0) return Number(offer.hotelPrice || 0);

  const hotels = Array.isArray(offer.hotels)
    ? offer.hotels
    : Array.isArray(offer.hotelOptions)
    ? offer.hotelOptions
    : [];

  return hotels.reduce((sum, h) => sum + Number(h.price || 0), 0);
}

async function loadOffers() {
  const box = $("offersBox");
  if (!box) return;

  box.innerHTML = `<div class="muted">Loading...</div>`;

  try {
    const data = await fetchJson("/api/offers");
    const offers = Array.isArray(data.offers) ? data.offers : [];

    if (!offers.length) {
      box.innerHTML = `<div class="muted">No offers yet.</div>`;
      return;
    }

    box.innerHTML = offers
      .map((offer) => {
        const currency = offer.currency || "EUR";
        const clientLink = `/api/offers/view/${offer.id}`;
        const publicLink = `/offer/${offer.id}`;
        const pdfLink = `/api/offers/${offer.id}/pdf`;

        const waText = encodeURIComponent(
          `Здравейте!\nВашата оферта е готова:\n${window.location.origin}${publicLink}`
        );

        const waLink = `https://wa.me/${offer.clientPhone || ""}?text=${waText}`;

        const flightPrice = getOfferFlightPrice(offer);
        const hotelPrice = getOfferHotelPrice(offer);
        const transferPrice = Number(offer.transferPrice || 0);
        const finalPrice = Number(offer.finalPrice || offer.price || 0);

        return `
          <div class="offer">
            <strong>${offer.destination || "Untitled offer"}</strong>
            <div class="muted">
              ${offer.id || "-"} · ${offer.clientName || "-"} · ${offer.status || "draft"}
            </div>

            <div>Flight: ${formatPrice(flightPrice, currency)}</div>
            <div>Hotel: ${formatPrice(hotelPrice, currency)}</div>
            <div>Transfer: ${formatPrice(transferPrice, currency)}</div>
            <div>Final: ${formatPrice(finalPrice, currency)}</div>

            <div class="actions">
              <a href="${clientLink}" target="_blank">Open</a>
              <a href="${pdfLink}" target="_blank">PDF</a>
              <a href="${waLink}" target="_blank">WhatsApp</a>
              <button type="button" onclick="editOffer('${offer.id}')">Edit</button>
              <button type="button" onclick="setStatus('${offer.id}', 'sent')">Sent</button>
              <button type="button" onclick="setStatus('${offer.id}', 'viewed')">Viewed</button>
              <button type="button" onclick="setStatus('${offer.id}', 'booked')">Book</button>
              <button type="button" onclick="setStatus('${offer.id}', 'cancelled')">Cancel</button>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Offers error:", error);
    box.innerHTML = `<div class="muted">Error loading offers: ${error.message}</div>`;
  }
}

async function setStatus(id, status) {
  try {
    await fetchJson(`/api/offers/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });

    await loadStats();
    await loadOffers();
  } catch (error) {
    alert(`Status update failed: ${error.message}`);
  }
}

function firstItem(items) {
  return Array.isArray(items) && items.length ? items[0] : {};
}

function setValue(id, value = "") {
  const el = $(id);
  if (el) el.value = value ?? "";
}

function setEditMode(offerId = null) {
  editingOfferId = offerId;
  const isEditing = Boolean(offerId);

  if ($("formTitle")) $("formTitle").textContent = isEditing ? "Edit Offer" : "Create Offer";
  if ($("editBanner")) {
    $("editBanner").style.display = isEditing ? "block" : "none";
    $("editBanner").textContent = isEditing ? `Editing ${offerId}` : "";
  }
  if ($("saveOfferBtn")) $("saveOfferBtn").textContent = isEditing ? "Update Offer" : "Save Offer";
  if ($("cancelEditBtn")) $("cancelEditBtn").style.display = isEditing ? "inline-block" : "none";
}

function populateForm(offer = {}) {
  const flight = firstItem(offer.flights || offer.flightOptions);
  const hotel = firstItem(offer.hotels || offer.hotelOptions);

  setValue("clientName", offer.clientName);
  setValue("clientPhone", offer.clientPhone);
  setValue("destination", offer.destination);
  setValue("travelDates", offer.travelDates);
  setValue("guests", offer.guests);
  setValue("status", offer.status || "draft");
  setValue("currency", offer.currency || "EUR");

  setValue("flightAirline", flight.airline);
  setValue("flightRoute", flight.route || offer.flightRoute);
  setValue("flightDeparture", flight.departure);
  setValue("flightArrival", flight.arrival);
  setValue("flightBaggage", flight.baggage);
  setValue("flightNotes", flight.notes);

  setValue("hotelName", hotel.name || offer.hotel);
  setValue("hotelStars", hotel.stars);
  setValue("hotelArea", hotel.area);
  setValue("hotelDistance", hotel.distance);
  setValue("hotelRoom", hotel.room);
  setValue("hotelMeal", hotel.meal);
  setValue("hotelRoomsLeft", hotel.roomsLeft);
  setValue("hotelDescription", hotel.description);
  setValue("hotelImages", Array.isArray(hotel.images) ? hotel.images.join("\n") : "");

  setValue("destinationDescription", offer.destinationDescription);
  setValue("notes", offer.notes);
  setValue("flightPrice", Number(offer.flightPrice || flight.price || 0).toFixed(2));
  setValue("hotelPrice", Number(offer.hotelPrice || hotel.price || 0).toFixed(2));
  setValue("transferPrice", Number(offer.transferPrice || 0).toFixed(2));
  setValue("markupPercent", Number(offer.markupPercent || 0).toFixed(2));
  setValue("finalPrice", offer.finalOverride ? Number(offer.finalPrice || 0).toFixed(2) : "");
  setValue("validForDays", offer.validForDays || 1);
  setValue("customValidUntil", "");

  calculatePricing();
}

async function editOffer(id) {
  try {
    const data = await fetchJson(`/api/offers/${id}`);
    populateForm(data.offer || {});
    setEditMode(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    alert(`Edit failed: ${error.message}`);
  }
}

function cancelEdit() {
  setEditMode(null);
  clearForm();
}

async function importData() {
  const flightUrl = $("flightUrl")?.value.trim() || "";
  const hotelUrl = $("hotelUrl")?.value.trim() || "";

  if (!flightUrl && !hotelUrl) {
    alert("Paste at least one URL.");
    return;
  }

  try {
    const data = await fetchJson("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flightUrl, hotelUrl })
    });

    if (data.flight) {
      if ($("flightRoute")) $("flightRoute").value = data.flight.route || $("flightRoute").value || "";
      if ($("flightAirline")) $("flightAirline").value = data.flight.airline || $("flightAirline").value || "";
      if (data.flight.dates && $("travelDates") && !$("travelDates").value) {
        $("travelDates").value = data.flight.dates;
      }
    }

    if (data.hotel && $("hotelName")) {
      $("hotelName").value = data.hotel.name || $("hotelName").value || "";
    }

    calculatePricing();
    alert("URL data imported.");
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  }
}

async function uploadFlightImage() {
  const input = $("flightImage");
  const file = input?.files?.[0];

  if (!file) {
    alert("Select a flight screenshot first.");
    return;
  }

  try {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("destination", $("destination")?.value || "");

    const data = await fetchJson("/api/import-image", {
      method: "POST",
      body: formData
    });

console.log("FLIGHT OCR DATA:", data);

    const f = data.flight || {};

    if ($("flightAirline")) $("flightAirline").value = f.airline || "";
    if ($("flightRoute")) $("flightRoute").value = f.route || "";
    if ($("mainFlightRoute")) $("mainFlightRoute").value = f.route || "";
    if ($("flightDeparture")) $("flightDeparture").value = f.departure || "";
    if ($("flightArrival")) $("flightArrival").value = f.arrival || "";
    if ($("flightBaggage")) $("flightBaggage").value = f.baggage || "";
    if ($("flightNotes")) $("flightNotes").value = f.notes || "";
    if ($("flightPrice")) $("flightPrice").value = Number(f.price || 0).toFixed(2);

    calculatePricing();
    alert("Flight screenshot imported successfully.");
  } catch (error) {
    console.error("Flight image import failed:", error);
    alert(`Error: ${error.message}`);
  }
}

async function uploadHotelImage() {
  const input = $("hotelImage");
  const file = input?.files?.[0];

  if (!file) {
    alert("Select a hotel screenshot first.");
    return;
  }

  try {
    const formData = new FormData();
    formData.append("image", file);

    const data = await fetchJson("/api/import-hotel-image", {
      method: "POST",
      body: formData
    });

    const h = data.hotel || {};

    if ($("hotelName")) $("hotelName").value = h.name || $("hotelName").value || "";
    if ($("hotelStars")) $("hotelStars").value = h.stars || $("hotelStars").value || "";
    if ($("hotelArea")) $("hotelArea").value = h.area || h.location || $("hotelArea").value || "";
    if ($("hotelDistance")) $("hotelDistance").value = h.distance || $("hotelDistance").value || "";
    if ($("hotelRoom")) $("hotelRoom").value = h.room || $("hotelRoom").value || "";
    if ($("hotelMeal")) $("hotelMeal").value = h.meal || $("hotelMeal").value || "";
    if ($("hotelRoomsLeft")) $("hotelRoomsLeft").value = h.roomsLeft || $("hotelRoomsLeft").value || "";
    if ($("hotelDescription")) {
      $("hotelDescription").value = h.description || $("hotelDescription").value || "";
    }

    if (Number(h.price || 0) > 0 && $("hotelPrice")) {
      $("hotelPrice").value = Number(h.price || 0).toFixed(2);
    }

    calculatePricing();
    alert("Hotel screenshot imported successfully.");
  } catch (error) {
    console.error("Hotel image import failed:", error);
    alert(`Error: ${error.message}`);
  }
}

function collectForm() {
  calculatePricing();

const destinationValue = $("destination")?.value.trim() || "";

const flightForValidation = {
  route: $("flightRoute")?.value.trim() || "",
  airline: $("flightAirline")?.value.trim() || "",
  departure: $("flightDeparture")?.value.trim() || "",
  arrival: $("flightArrival")?.value.trim() || ""
};

const hotelForValidation = {
  name: $("hotelName")?.value.trim() || "",
  area: $("hotelArea")?.value.trim() || "",
  description: $("hotelDescription")?.value.trim() || ""
};

const formValidationWarnings = [];

if (!destinationMatchesFlight(destinationValue, flightForValidation)) {
  formValidationWarnings.push("Flight mismatch");
}

if (!destinationMatchesHotel(destinationValue, hotelForValidation)) {
  formValidationWarnings.push("Hotel mismatch");
}

  return {
    clientName: $("clientName")?.value.trim() || "",
    clientPhone: $("clientPhone")?.value.trim() || "",
    destination: $("destination")?.value.trim() || "",
    travelDates: $("travelDates")?.value.trim() || "",
    guests: $("guests")?.value.trim() || "",
    status: $("status")?.value || "draft",
    currency: $("currency")?.value.trim() || "EUR",

    flightAirline: $("flightAirline")?.value.trim() || "",
    flightRoute: $("flightRoute")?.value.trim() || "",
    flightDeparture: $("flightDeparture")?.value.trim() || "",
    flightArrival: $("flightArrival")?.value.trim() || "",
    flightBaggage: $("flightBaggage")?.value.trim() || "",
    flightNotes: $("flightNotes")?.value.trim() || "",

    hotelName: $("hotelName")?.value.trim() || "",
    hotelStars: $("hotelStars")?.value.trim() || "",
    hotelArea: $("hotelArea")?.value.trim() || "",
    hotelDistance: $("hotelDistance")?.value.trim() || "",
    hotelRoom: $("hotelRoom")?.value.trim() || "",
    hotelMeal: $("hotelMeal")?.value.trim() || "",
    hotelRoomsLeft: $("hotelRoomsLeft")?.value.trim() || "",
    hotelDescription: $("hotelDescription")?.value.trim() || "",
    hotelImages: splitLines($("hotelImages")?.value || ""),

    destinationDescription: $("destinationDescription")?.value.trim() || "",
    notes: $("notes")?.value.trim() || "",

    flightPrice: num("flightPrice"),
    hotelPrice: num("hotelPrice"),
    transferPrice: num("transferPrice"),
    basePrice: num("basePrice"),
    markupPercent: num("markupPercent"),
    finalPrice: $("finalPrice")?.value ? Number($("finalPrice").value) : "",

    validForDays: Number($("validForDays")?.value || 1),
    customValidUntil: $("customValidUntil")?.value || "",
    validationWarnings: formValidationWarnings
  };
}

async function saveOffer() {
  const payload = collectForm();

  const destinationValue = payload.destination || "";

  const flightForValidation = {
    route: payload.flightRoute || "",
    airline: payload.flightAirline || "",
    departure: payload.flightDeparture || "",
    arrival: payload.flightArrival || ""
  };

  const hotelForValidation = {
    name: payload.hotelName || payload.hotel || "",
    area: payload.hotelArea || "",
    description: payload.hotelDescription || ""
  };

const flightText = JSON.stringify(flightForValidation).toLowerCase();
const hotelText = JSON.stringify(hotelForValidation).toLowerCase();

  const validationWarnings = [];

 if (
  flightText &&
  !flightText.includes("needs review") &&
  !destinationMatchesFlight(destinationValue, flightForValidation)
) {
  validationWarnings.push("Flight mismatch");
}

if (
  hotelText &&
  !hotelText.includes("needs review") &&
  !destinationMatchesHotel(destinationValue, hotelForValidation)
) {
  validationWarnings.push("Hotel mismatch");
}

  payload.validationWarnings = validationWarnings;
console.log("SAVE PAYLOAD WARNINGS:", payload.validationWarnings);

  if (!payload.destination) {
    alert("Destination is required.");
    return;
  }
  try {
    const result = await fetchJson(editingOfferId ? `/api/offers/${editingOfferId}` : "/api/offers", {
      method: editingOfferId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    alert(editingOfferId ? `Offer updated: ${result.offer.id}` : `Offer saved: ${result.offer.id}`);
    setEditMode(null);

    await loadStats();
    await loadOffers();

    window.open(`/api/offers/view/${result.offer.id}`, "_blank");
  } catch (error) {
    alert(`Save failed: ${error.message}`);
  }
}

function clearForm() {
  if (editingOfferId) setEditMode(null);

  const ids = [
    "clientName",
    "clientPhone",
    "destination",
    "travelDates",
    "guests",
    "flightUrl",
    "hotelUrl",
    "flightAirline",
    "flightRoute",
    "flightDeparture",
    "flightArrival",
    "flightBaggage",
    "flightNotes",
    "hotelName",
    "hotelStars",
    "hotelArea",
    "hotelDistance",
    "hotelRoom",
    "hotelMeal",
    "hotelRoomsLeft",
    "hotelDescription",
    "hotelImages",
    "destinationDescription",
    "notes",
    "customValidUntil",
    "finalPrice"
  ];

  ids.forEach((id) => {
    if ($(id)) $("" + id).value = "";
  });

  if ($("flightPrice")) $("flightPrice").value = "0";
  if ($("hotelPrice")) $("hotelPrice").value = "0";
  if ($("transferPrice")) $("transferPrice").value = "0";
  if ($("basePrice")) $("basePrice").value = "0";
  if ($("markupPercent")) $("markupPercent").value = "5";
  if ($("currency")) $("currency").value = "EUR";
  if ($("validForDays")) $("validForDays").value = "1";
  if ($("status")) $("status").value = "draft";

  calculatePricing();
}

function bindPricingEvents() {
  ["flightPrice", "hotelPrice", "transferPrice", "markupPercent", "finalPrice", "currency"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", calculatePricing);
  });
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase();
}

function destinationMatchesFlight(destination, flight = {}) {
  const d = normalizeText(destination);
  const text = normalizeText(JSON.stringify(flight));

  if (d.includes("rome") || d.includes("рим")) {
    return text.includes("rome") || text.includes("roma") || text.includes("рим") || text.includes("fco") || text.includes("fiumicino");
  }

  if (d.includes("tokyo") || d.includes("токио")) {
    return text.includes("tokyo") || text.includes("nrt") || text.includes("hnd") || text.includes("akihabara");
  }

  if (d.includes("barcelona") || d.includes("барселона")) {
    return text.includes("barcelona") || text.includes("bcn");
  }

  if (d.includes("bari") || d.includes("бари")) {
    return text.includes("bari") || text.includes("bri");
  }

  return true;
}

function destinationMatchesHotel(destination, hotel = {}) {
  const d = normalizeText(destination);
  const text = normalizeText(JSON.stringify(hotel));

  if (d.includes("rome") || d.includes("рим")) {
    return text.includes("rome") || text.includes("roma") || text.includes("рим") || text.includes("fiumicino") || text.includes("fco");
  }

  if (d.includes("tokyo") || d.includes("токио")) {
    return text.includes("tokyo") || text.includes("akihabara") || text.includes("shinjuku") || text.includes("ginza");
  }

  if (d.includes("barcelona") || d.includes("барселона")) {
    return text.includes("barcelona") || text.includes("bcn");
  }

  if (d.includes("bari") || d.includes("бари")) {
    return text.includes("bari");
  }

  return true;
}

function confirmMismatchWarnings(destination, flight, hotel) {
  const warnings = [];

  if (!destinationMatchesFlight(destination, flight)) {
    warnings.push("⚠ Полетът може да не съвпада с избраната дестинация.");
  }

  if (!destinationMatchesHotel(destination, hotel)) {
    warnings.push("⚠ Хотелът може да не съвпада с избраната дестинация.");
  }

  if (!warnings.length) return true;

  return confirm(
    `${warnings.join("\n")}\n\n` +
    `Destination: ${destination || "-"}\n` +
    `Flight: ${flight?.route || "-"}\n` +
    `Hotel: ${hotel?.name || "-"}\n\n` +
    `Да продължа ли въпреки това?`
  );
}

function getDestinationValue() {
  return (
    $("destination")?.value ||
    document.querySelector('[name="destination"]')?.value ||
    ""
  ).trim();
}

async function autoBuildOffer() {
  try {
    const flightFile = $("flightImage")?.files?.[0];
    const hotelFile = $("hotelImage")?.files?.[0];

    if (!flightFile) {
      alert("Select flight screenshot first.");
      return;
    }

    if (!hotelFile) {
      alert("Select hotel screenshot first.");
      return;
    }

    // 1) Import flight screenshot
    const flightForm = new FormData();
    flightForm.append("image", flightFile);
    flightForm.append("destination", $("destination")?.value || "");

    const flightData = await fetchJson("/api/import-image", {
      method: "POST",
      body: flightForm
    });

    const f = flightData.flight || {};

    if ($("flightAirline")) $("flightAirline").value = f.airline || "";
    if ($("flightRoute")) $("flightRoute").value = f.route || "";
    if ($("flightDeparture")) $("flightDeparture").value = f.departure || "";
    if ($("flightArrival")) $("flightArrival").value = f.arrival || "";
    if ($("flightBaggage")) $("flightBaggage").value = f.baggage || "";
    if ($("flightNotes")) $("flightNotes").value = f.notes || "";
    if ($("flightPrice")) $("flightPrice").value = Number(f.price || 0).toFixed(2);

    // 2) Import hotel screenshot
  const hotelForm = new FormData();

hotelForm.append("image", hotelFile);
hotelForm.append("destination", $("destination")?.value || "");

const hotelData = await fetchJson("/api/import-hotel-image", {
  method: "POST",
  body: hotelForm
});

    const h = hotelData.hotel || {};

console.log("AUTO HOTEL DATA:", h);

const selectedDestination = getDestinationValue();

const validationWarnings = [];

if (!destinationMatchesFlight(selectedDestination, f)) {
  validationWarnings.push("Flight mismatch");
}

if (!destinationMatchesHotel(selectedDestination, h)) {
  validationWarnings.push("Hotel mismatch");
}

window.currentValidationWarnings = validationWarnings;

if (validationWarnings.length) {
  const shouldContinue = confirm(
    `⚠ Възможно е несъответствие в офертата.\n\n` +
    `Destination: ${selectedDestination || "-"}\n` +
    `Flight: ${f?.route || "-"}\n` +
    `Hotel: ${h?.name || "-"}\n\n` +
    `Да продължа ли въпреки това?`
  );

  if (!shouldContinue) {
    alert("AUTO BUILD stopped. Please check flight/hotel screenshots.");
    return;
  }
}
    if ($("hotelName")) $("hotelName").value = h.name || $("hotelName").value || "";
    if ($("hotelStars")) $("hotelStars").value = h.stars || $("hotelStars").value || "";
    if ($("hotelArea")) $("hotelArea").value = h.area || h.location || $("hotelArea").value || "";
    if ($("hotelDistance")) $("hotelDistance").value = h.distance || $("hotelDistance").value || "";
    if ($("hotelRoom")) $("hotelRoom").value = h.room || $("hotelRoom").value || "";
    if ($("hotelMeal")) $("hotelMeal").value = h.meal || $("hotelMeal").value || "";
    if ($("hotelRoomsLeft")) $("hotelRoomsLeft").value = h.roomsLeft || $("hotelRoomsLeft").value || "";
    if ($("hotelDescription")) $("hotelDescription").value = h.description || $("hotelDescription").value || "";

    if (Number(h.price || 0) > 0 && $("hotelPrice")) {
      $("hotelPrice").value = Number(h.price || 0).toFixed(2);
    }

    // 3) Auto destination text
    const destination = $("destination")?.value || "";
    const hotelName = $("hotelName")?.value || "";
    const destinationKey = destination.toLowerCase();
    const destinationName = destination.trim() || "Дестинацията";
    const hotelType = "citybreak";
    const hotelHighlights = (window.HOTEL_TAGS?.[hotelType] || [])
      .map(item => `• ${item}`)
      .join("\n");

    if ($("destinationDescription")) {
      const baseDescription =
        window.DESTINATION_DESCRIPTIONS?.[destinationKey] ||
        `${destinationName} е внимателно подбрана дестинация за комфортно и запомнящо се пътуване.`;

      $("destinationDescription").value =
        `${baseDescription.trim()}\n\n` +
        `Офертата комбинира удобен полет, ${hotelName ? `хотел ${hotelName}` : "подбран хотел"} ` +
        `и ясна крайна цена, без скрити вътрешни разбивки за клиента.` +
        (hotelHighlights ? `\n\nХотелът предлага:\n${hotelHighlights}` : "");
    }

    // 4) Auto notes
    if ($("notes") && !$("notes").value) {
      $("notes").value =
        `Офертата е подбрана според наличните полетни и хотелски условия. ` +
        `Препоръчваме потвърждение възможно най-скоро, тъй като местата и цените подлежат на промяна.`;
    }

    calculatePricing();

    alert("GT63 AUTO BUILD completed. Review and click Save Offer.");
  } catch (error) {
    console.error("AUTO BUILD failed:", error);
    alert(`AUTO BUILD failed: ${error.message}`);
  }
}

window.importData = importData;
window.uploadFlightImage = uploadFlightImage;
window.uploadHotelImage = uploadHotelImage;
window.autoBuildOffer = autoBuildOffer;
window.saveOffer = saveOffer;
window.clearForm = clearForm;
window.setStatus = setStatus;
window.logout = logout;
window.editOffer = editOffer;
window.cancelEdit = cancelEdit;

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadCurrentUser();
  } catch (e) {
    console.error("LOAD USER ERROR:", e);
  }

  try {
    bindPricingEvents();
    calculatePricing();
  } catch (e) {
    console.error("INIT FORM ERROR:", e);
  }

  try {
    await loadStats();
  } catch (e) {
    console.error("LOAD STATS ERROR:", e);
  }

  try {
    await loadOffers();
  } catch (e) {
    console.error("LOAD OFFERS ERROR:", e);
  }
});
