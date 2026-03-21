async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

function formatPrice(value, currency = "EUR") {
  const num = Number(value || 0);
  return `${num.toFixed(2)} ${currency}`;
}

function getStatusClass(status) {
  return `status-${String(status || "draft").toLowerCase()}`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

// ================== LOAD OFFERS ==================
async function loadOffers() {
  const box = document.getElementById("adminOffers");
  if (!box) return;

  try {
    const data = await fetchJson("/api/offers");
    const offers = safeArray(data.offers);

    const statusFilter = document.getElementById("statusFilter")?.value || "all";
    const destinationFilter = (document.getElementById("destination")?.value || "").trim().toLowerCase();
    const fromDate = document.getElementById("from")?.value || "";
    const toDate = document.getElementById("to")?.value || "";
    const sort = document.getElementById("sort")?.value || "newest";

    let filtered = offers.filter((offer) => {
      const statusOk = statusFilter === "all" || String(offer.status || "").toLowerCase() === statusFilter.toLowerCase();

      const destinationOk =
        !destinationFilter ||
        String(offer.destination || "").toLowerCase().includes(destinationFilter);

      const created = offer.createdAt ? new Date(offer.createdAt) : null;
      const fromOk = !fromDate || (created && created >= new Date(fromDate));
      const toOk = !toDate || (created && created <= new Date(`${toDate}T23:59:59`));

      return statusOk && destinationOk && fromOk && toOk;
    });

    filtered.sort((a, b) => {
      if (sort === "oldest") {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      if (sort === "price_desc") {
        return Number(b.finalPrice || b.price || 0) - Number(a.finalPrice || a.price || 0);
      }
      if (sort === "price_asc") {
        return Number(a.finalPrice || a.price || 0) - Number(b.finalPrice || b.price || 0);
      }
      if (sort === "destination") {
        return String(a.destination || "").localeCompare(String(b.destination || ""));
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    if (!filtered.length) {
      box.innerHTML = "<p>No offers found.</p>";
      return;
    }

    box.innerHTML = filtered.map((offer) => `
      <div class="request-card">
        <div class="request-top">
          <strong>${offer.id || "-"}</strong>
          <span class="status-badge ${getStatusClass(offer.status)}">${offer.status || "draft"}</span>
        </div>

        <p><strong>Client:</strong> ${offer.clientName || "-"}</p>
        <p><strong>Phone:</strong> ${offer.clientPhone || "-"}</p>
        <p><strong>Destination:</strong> ${offer.destination || "-"}</p>
        <p><strong>Flight:</strong> ${offer.flightRoute || "-"}</p>
        <p><strong>Hotel:</strong> ${offer.hotel || "-"}</p>
        <p><strong>Dates:</strong> ${offer.travelDates || "-"}</p>
        <p><strong>Guests:</strong> ${offer.guests || "-"}</p>
        <p><strong>Final Price:</strong> ${formatPrice(offer.finalPrice || offer.price || 0, offer.currency || "EUR")}</p>

        <div class="request-actions">
          <button onclick="openGeneratedOffer('${offer.id}')">Open</button>
          <button onclick="downloadPDF('${offer.id}')">PDF</button>
          <button onclick="copyWhatsApp('${offer.id}')">WhatsApp</button>
        </div>
      </div>
    `).join("");

  } catch (err) {
    console.error("Failed to load offers:", err);
    box.innerHTML = `<p style="color:#ffb4b4;">Offers load error: ${err.message}</p>`;
  }
}

// ================== REQUESTS ==================
async function loadRequestsQueue() {
  try {
    const data = await fetchJson("/api/requests");
    const requests = safeArray(data.requests);

    const box = document.getElementById("requestsList");
    if (!box) return;

    if (!requests.length) {
      box.innerHTML = "<p>No requests yet.</p>";
      return;
    }

    box.innerHTML = requests.map((r) => `
      <div class="request-card">
        <div class="request-top">
          <strong>${r.id}</strong>
          <span class="status-badge ${getStatusClass(r.status || "new")}">${r.status || "new"}</span>
        </div>

        <p><strong>Client:</strong> ${r.name || "-"}</p>
        <p><strong>Phone:</strong> ${r.phone || "-"}</p>
        <p><strong>Destination:</strong> ${r.destination || "-"}</p>
        <p><strong>From:</strong> ${r.from || "-"}</p>
        <p><strong>Dates:</strong> ${r.dates || "-"}</p>
        <p><strong>Guests:</strong> ${r.guests || "-"}</p>
        <p><strong>Budget:</strong> ${r.budget || 0} EUR</p>

        <div class="request-actions">
          <button onclick="generateOfferFromRequest('${r.id}')">Generate Offer</button>
        </div>
      </div>
    `).join("");

  } catch (err) {
    console.error("Failed to load requests queue:", err);
  }
}

// ================== ACTIONS ==================
async function generateOfferFromRequest(requestId) {
  try {
    const data = await fetchJson(`/api/requests/${requestId}/generate-offer`, {
      method: "POST"
    });

    if (!data.success) {
      alert(data.error || "Failed to generate offer");
      return;
    }

    alert("Offer created: " + data.offer.id);

    await loadRequestsQueue();
    await loadOffers();

  } catch (err) {
    alert("Generate offer failed");
  }
}

function openGeneratedOffer(offerId) {
  if (!offerId) return;
  window.open(`/api/offers/view/${offerId}`, "_blank");
}

function downloadPDF(id) {
  window.open(`/api/offers/${id}/pdf`, "_blank");
}

async function copyWhatsApp(id) {
  try {
    const res = await fetch(`/api/offers/${id}`);
    const data = await res.json();

    if (!data.success) {
      alert("Offer not found");
      return;
    }

    const offer = data.offer;

    const text = `Здравей 👋

Имаме готова оферта:

📍 ${offer.destination}
💰 ${offer.finalPrice || offer.price} ${offer.currency}

👉 Оферта:
${window.location.origin}/api/offers/view/${offer.id}

👉 PDF:
${window.location.origin}/api/offers/${offer.id}/pdf`;

    await navigator.clipboard.writeText(text);

    alert("WhatsApp текст копиран ✅");

  } catch (err) {
    alert("Copy failed");
  }
}

// ================== INIT ==================
const filterIds = ["statusFilter", "destination", "from", "to", "sort"];

filterIds.forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", loadOffers);
  el.addEventListener("change", loadOffers);
});

setTimeout(() => {
  loadOffers();
  loadRequestsQueue();
}, 100);