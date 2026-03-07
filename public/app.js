const offerForm = document.getElementById("offerForm");
const offersList = document.getElementById("offersList");
const snapshot = document.getElementById("snapshot");
const clearBtn = document.getElementById("clearBtn");
const formMessage = document.getElementById("formMessage");

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
Total price: ${Number(offer.price || 0).toFixed(2)} ${offer.currency || "EUR"}
Valid until: ${formatDate(offer.validUntil)}

View offer:
${link}

2L1P Neural Travel`;

  return `https://wa.me/${safePhone}?text=${encodeURIComponent(text)}`;
}

function offerCard(offer) {
  const link = buildOfferLink(offer.id);
  const whatsappUrl = buildWhatsAppUrl(offer.clientPhone || "", offer);

  return `
    <div class="offer-card">
      <div class="offer-top">
        <div>
          ${badge(offer.effectiveStatus || offer.status || "draft")}
          <h3 class="offer-title">${offer.destination || "Untitled Offer"}</h3>
          <div class="offer-sub">
            ${offer.flightRoute || "No route"} · ${offer.hotel || "No hotel"} · ${offer.guests || "No guests"}
          </div>
        </div>

        <div class="status-row">
          <select data-id="${offer.id}" class="status-select">
            ${["draft", "sent", "viewed", "booked", "cancelled", "lost"]
              .map(
                (s) =>
                  `<option value="${s}" ${offer.status === s ? "selected" : ""}>${s}</option>`
              )
              .join("")}
          </select>
        </div>
      </div>

      <div class="price-line">${Number(offer.price || 0).toFixed(2)} ${offer.currency || "EUR"}</div>

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
            ${Number(offer.markupPercent || 0).toFixed(2)}% /
            ${(Number(offer.price || 0) - Number(offer.basePrice || 0)).toFixed(2)} ${offer.currency || "EUR"}
          </div>
        </div>
      </div>

      <div class="offer-actions">
        <a class="btn secondary" href="/offer/${offer.id}" target="_blank">Client Page</a>
        <a class="btn secondary" href="/api/offers/${offer.id}/pdf" target="_blank">PDF</a>
        <a class="btn success" href="${whatsappUrl}" target="_blank">WhatsApp</a>
        <button class="btn secondary copy-link" data-link="${link}">Copy Link</button>
      </div>
    </div>
  `;
}

async function loadSnapshot() {
  try {
    const res = await fetch("/api/offers/stats");
    if (!res.ok) throw new Error("Failed to load stats");

    const s = await res.json();

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
        <div class="label">Revenue Potential</div>
        <div class="value">${Number(s.totalRevenuePotential || 0).toFixed(2)} EUR</div>
      </div>
      <div class="kpi">
        <div class="label">Margin Potential</div>
        <div class="value">${Number(s.totalMarginPotential || 0).toFixed(2)} EUR</div>
      </div>
    `;
  } catch (err) {
    snapshot.innerHTML = `<div class="empty">Stats unavailable</div>`;
  }
}

async function loadOffers() {
  try {
    const res = await fetch("/api/offers");
    if (!res.ok) throw new Error("Failed to load offers");

    const data = await res.json();
    const offers = Array.isArray(data) ? data : (data.offers || []);

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
  } catch (err) {
    offersList.innerHTML = `<div class="empty">Offers unavailable</div>`;
  }
}

async function sendWhatsApp() {
  let phoneInput = document.getElementById("clientPhone");
  let phone = phoneInput ? phoneInput.value.trim() : "";

  if (!phone) {
    alert("Please enter client phone number");
    return;
  }

  if (!window.currentOffer?.id) {
    alert("Offer not generated yet");
    return;
  }

  const url = buildWhatsAppUrl(phone, window.currentOffer);
  window.open(url, "_blank");
}

offerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formMessage.textContent = "Saving...";

  const payload = Object.fromEntries(new FormData(offerForm).entries());

  try {
    const res = await fetch("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      formMessage.textContent = data.message || "Error";
      return;
    }

    window.currentOffer = data.offer;

    formMessage.textContent = `Saved ${data.offer.id}`;
    offerForm.reset();
    offerForm.currency.value = "EUR";
    offerForm.validForDays.value = "1";
    offerForm.status.value = "draft";
    offerForm.clientPhone.value = data.offer.clientPhone || "";

    loadOffers();
    loadSnapshot();
  } catch (err) {
    formMessage.textContent = "Save failed";
  }
});

clearBtn.addEventListener("click", () => {
  offerForm.reset();
  offerForm.currency.value = "EUR";
  offerForm.validForDays.value = "1";
  offerForm.status.value = "draft";
  formMessage.textContent = "";
  window.currentOffer = null;
});

loadOffers();
loadSnapshot();