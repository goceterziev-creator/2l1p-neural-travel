const offerForm = document.getElementById("offerForm");
const offersList = document.getElementById("offersList");
const snapshot = document.getElementById("snapshot");
const statusFilter = document.getElementById("statusFilter");
const formMessage = document.getElementById("formMessage");
const clearBtn = document.getElementById("clearBtn");

window.currentOffer = null;

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("bg-BG");
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getStatusClass(status) {
  const s = String(status || "draft").toLowerCase();
  return `status-${s}`;
}

function getEffectiveStatus(offer) {
  const status = String(
    offer?.effectiveStatus || offer?.status || "draft"
  ).toLowerCase();

  if (status === "booked" || status === "cancelled" || status === "expired") {
    return status;
  }

  if (offer?.validUntil) {
    const validUntil = new Date(offer.validUntil);
    if (!Number.isNaN(validUntil.getTime()) && validUntil.getTime() < Date.now()) {
      return "expired";
    }
  }

  return status;
}

function buildOfferLink(offerId) {
  return `${window.location.origin}/api/offers/view/${offerId}`;
}

function buildPdfLink(offerId) {
  return `${window.location.origin}/api/offers/${offerId}/pdf`;
}

function buildWhatsAppUrl(phone, offer) {
  const cleanedPhone = String(phone || "").replace(/[^\d]/g, "");
  const link = buildOfferLink(offer.id);

  const text = `Здравейте${offer.clientName ? " " + offer.clientName : ""}!

Вашата оферта е готова.

Offer ID: ${offer.id}
Destination: ${offer.destination || "TBA"}
Total price: ${safeNumber(offer.finalPrice ?? offer.price).toFixed(2)} ${offer.currency || "EUR"}
Valid until: ${formatDate(offer.validUntil)}

View offer:
${link}`;

  return `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(text)}`;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const message = data?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }

  return data;
}

function collectFormData(form) {
  const fd = new FormData(form);

  const basePrice = Number(fd.get("basePrice") || 0);
  const markupPercent = Number(fd.get("markupPercent") || 0);
  const explicitPrice = fd.get("price");

  const finalPrice =
    explicitPrice !== null && explicitPrice !== ""
      ? Number(explicitPrice)
      : Number((basePrice * (1 + markupPercent / 100)).toFixed(2));

  const customValidUntil = String(fd.get("customValidUntil") || "").trim();
  const validForDays = Number(fd.get("validForDays") || 1);

  return {
    clientName: String(fd.get("clientName") || "").trim(),
    clientPhone: String(fd.get("clientPhone") || "").trim(),
    destination: String(fd.get("destination") || "").trim(),
    flightRoute: String(fd.get("flightRoute") || "").trim(),
    hotel: String(fd.get("hotel") || "").trim(),
    travelDates: String(fd.get("travelDates") || "").trim(),
    guests: String(fd.get("guests") || "").trim(),
    status: String(fd.get("status") || "draft").trim().toLowerCase(),
    basePrice,
    markupPercent,
    finalPrice,
    currency: String(fd.get("currency") || "EUR").trim(),
    validForDays,
    customValidUntil,
    notes: String(fd.get("notes") || "").trim()
  };
}

async function saveOfferFromForm(event) {
  event.preventDefault();

  try {
    const payload = collectFormData(offerForm);

    const body = {
      clientName: payload.clientName,
      clientPhone: payload.clientPhone,
      destination: payload.destination,
      flightRoute: payload.flightRoute,
      hotel: payload.hotel,
      travelDates: payload.travelDates,
      guests: payload.guests,
      status: payload.status,
      basePrice: payload.basePrice,
      markup: payload.markupPercent,
      finalPrice: payload.finalPrice,
      currency: payload.currency,
      validDays: payload.validForDays,
      validUntil: payload.customValidUntil || "",
      notes: payload.notes
    };

    const data = await fetchJson("/api/offers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!data.success) {
      throw new Error(data.error || "Save failed");
    }

    window.currentOffer = data.offer;

    if (formMessage) {
      formMessage.textContent = `Saved: ${data.offer.id}`;
    }

    await loadOffers();
  } catch (error) {
    console.error("Save offer error:", error);

    if (formMessage) {
      formMessage.textContent = error.message || "Save failed";
    }

    alert(error.message || "Save failed");
  }
}

function clearOfferForm() {
  if (!offerForm) return;
  offerForm.reset();
  window.currentOffer = null;

  if (formMessage) {
    formMessage.textContent = "";
  }
}

function sendWhatsApp() {
  if (!window.currentOffer) {
    alert("Първо запази офертата.");
    return;
  }

  const url = buildWhatsAppUrl(
    window.currentOffer.clientPhone || "",
    window.currentOffer
  );

  window.open(url, "_blank");
}

async function bookOffer(id) {
  try {
    const res = await fetch(`/api/offers/${id}/book`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data?.error || "Booking failed");
    }

    alert("Booked successfully");
    await loadOffers();
  } catch (error) {
    console.error("Booking error:", error);
    alert(error.message || "Booking failed");
  }
}

async function updateStatus(id, status) {
  try {
    const data = await fetchJson(`/api/offers/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status })
    });

    if (!data.success) {
      throw new Error(data.error || "Status update failed");
    }

    await loadOffers();
  } catch (error) {
    console.error("Status update error:", error);
    alert(error.message || "Status update failed");
  }
}

function offerCard(offer) {
  const link = buildOfferLink(offer.id);
  const pdfLink = buildPdfLink(offer.id);
  const whatsappUrl = buildWhatsAppUrl(offer.clientPhone || "", offer);
  const effectiveStatus = getEffectiveStatus(offer);

  const price = safeNumber(offer.finalPrice ?? offer.price);
  const basePrice = safeNumber(offer.basePrice);
  const markupPercent = safeNumber(
    offer.markupPercent ??
      offer.markup ??
      (basePrice > 0 ? ((price - basePrice) / basePrice) * 100 : 0)
  );
  const margin = safeNumber(
    offer.marginAmount ?? offer.margin ?? (price - basePrice)
  );

  return `
    <div class="offer-card">
      <div class="offer-top">
        <div>
          <h3 class="offer-title">${escapeHtml(offer.destination || "Untitled Offer")}</h3>
          <div class="offer-sub">
            ${escapeHtml(offer.flightRoute || "No route")} •
            ${escapeHtml(offer.hotel || "No hotel")} •
            ${escapeHtml(offer.guests || "No guests")}
          </div>
        </div>

        <div class="offer-status-wrap">
          <span class="status-badge ${getStatusClass(effectiveStatus)}">
            ${escapeHtml(effectiveStatus)}
          </span>
        </div>
      </div>

      <div class="price-line">
        ${price.toFixed(2)} ${escapeHtml(offer.currency || "EUR")}
      </div>

      <div class="offer-grid">
        <div class="meta">
          <div class="label">Offer ID</div>
          <div class="value">${escapeHtml(offer.id)}</div>
        </div>

        <div class="meta">
          <div class="label">Client</div>
          <div class="value">${escapeHtml(offer.clientName || "-")}</div>
        </div>

        <div class="meta">
          <div class="label">Phone</div>
          <div class="value">${escapeHtml(offer.clientPhone || "-")}</div>
        </div>

        <div class="meta">
          <div class="label">Valid until</div>
          <div class="value">${escapeHtml(formatDate(offer.validUntil))}</div>
        </div>

        <div class="meta">
          <div class="label">Base price</div>
          <div class="value">${basePrice.toFixed(2)} ${escapeHtml(offer.currency || "EUR")}</div>
        </div>

        <div class="meta">
          <div class="label">Markup / Margin</div>
          <div class="value">${markupPercent.toFixed(2)}% / ${margin.toFixed(2)} ${escapeHtml(offer.currency || "EUR")}</div>
        </div>
      </div>

      <div class="offer-actions">
        <a class="btn secondary" href="${link}" target="_blank" rel="noopener">Open</a>
        <a class="btn secondary" href="${pdfLink}" target="_blank" rel="noopener">PDF</a>
        <a class="btn secondary" href="${whatsappUrl}" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn primary" onclick="bookOffer('${offer.id}')">Book</button>

        <select class="status-select" onchange="updateStatus('${offer.id}', this.value)">
          ${["draft", "sent", "viewed", "booked", "cancelled", "expired"]
            .map(
              (s) =>
                `<option value="${s}" ${
                  String(offer.status || "").toLowerCase() === s ? "selected" : ""
                }>${s}</option>`
            )
            .join("")}
        </select>
      </div>
    </div>
  `;
}

function renderSnapshot(offers) {
  if (!snapshot) return;

  const total = offers.length;
  const active = offers.filter((o) => {
    const s = getEffectiveStatus(o);
    return !["booked", "cancelled", "expired"].includes(s);
  }).length;

  const revenue = offers.reduce(
    (sum, o) => sum + safeNumber(o.finalPrice ?? o.price),
    0
  );

  const margin = offers.reduce((sum, o) => {
    const price = safeNumber(o.finalPrice ?? o.price);
    const base = safeNumber(o.basePrice);
    return sum + (price - base);
  }, 0);

  snapshot.innerHTML = `
    <div class="stat-card">
      <div class="label">Total Offers</div>
      <div class="value">${total}</div>
    </div>
    <div class="stat-card">
      <div class="label">Active Offers</div>
      <div class="value">${active}</div>
    </div>
    <div class="stat-card">
      <div class="label">Revenue</div>
      <div class="value">${revenue.toFixed(2)} EUR</div>
    </div>
    <div class="stat-card">
      <div class="label">Margin</div>
      <div class="value">${margin.toFixed(2)} EUR</div>
    </div>
  `;
}

async function loadOffers() {
  if (!offersList) return;

  try {
    const data = await fetchJson("/api/offers");
    const offers = Array.isArray(data.offers) ? data.offers : [];

    const selectedStatus = String(statusFilter?.value || "all").toLowerCase();

    const filtered = offers.filter((offer) => {
      if (selectedStatus === "all") return true;
      return getEffectiveStatus(offer) === selectedStatus;
    });

    renderSnapshot(offers);

    if (!filtered.length) {
      offersList.innerHTML = `<p>No offers found.</p>`;
      return;
    }

    offersList.innerHTML = filtered.map(offerCard).join("");
  } catch (error) {
    console.error("Load offers error:", error);
    offersList.innerHTML = `<p style="color:red;">Failed to load offers: ${escapeHtml(error.message)}</p>`;
  }
}

if (offerForm) {
  offerForm.addEventListener("submit", saveOfferFromForm);
}

if (clearBtn) {
  clearBtn.addEventListener("click", clearOfferForm);
}

if (statusFilter) {
  statusFilter.addEventListener("change", loadOffers);
}

document.addEventListener("DOMContentLoaded", loadOffers);