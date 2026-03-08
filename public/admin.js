const hotDealWidgets = document.getElementById("hotDealWidgets");
const adminOffers = document.getElementById("adminOffers");
const adminStats = document.getElementById("adminStats");
const filterIds = ["q", "status", "destination", "from", "to", "sort"];

const pad = (n) => String(n).padStart(2, "0");

const formatDate = (d) => {
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
};

const badge = (s) => `<span class="badge ${s}">${s}</span>`;

function row(offer) {
  const link = `${location.origin}/offer/${offer.id}`;

  return `
    <div class="offer-card">
      <div class="offer-top">
        <div>
          ${badge(offer.effectiveStatus || offer.status || "draft")}
          <h3 class="offer-title">${offer.destination || "Untitled Offer"}</h3>
          <div class="offer-sub">
            ${offer.clientName || "No client"} · ${offer.flightRoute || "No route"} · ${offer.hotel || "No hotel"}
          </div>
        </div>

        <div class="status-row">
          <select data-id="${offer.id}" class="status-select">
            ${["draft", "sent", "viewed", "booked", "lost", "cancelled"]
              .map(
                (s) =>
                  `<option value="${s}" ${offer.status === s ? "selected" : ""}>${s}</option>`
              )
              .join("")}
          </select>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-box">
          <div class="label">Client Price</div>
          <div class="value">${Number(offer.price || 0).toFixed(2)} ${offer.currency || "EUR"}</div>
        </div>

        <div class="meta-box">
          <div class="label">Base Price</div>
          <div class="value">${Number(offer.basePrice || 0).toFixed(2)} ${offer.currency || "EUR"}</div>
        </div>

        <div class="meta-box">
          <div class="label">Margin</div>
          <div class="value">${(Number(offer.price || 0) - Number(offer.basePrice || 0)).toFixed(2)} ${offer.currency || "EUR"}</div>
        </div>

        <div class="meta-box">
          <div class="label">Markup</div>
          <div class="value">${Number(offer.markupPercent || 0).toFixed(2)}%</div>
        </div>

        <div class="meta-box">
          <div class="label">Created</div>
          <div class="value">${formatDate(offer.createdAt)}</div>
        </div>

        <div class="meta-box">
          <div class="label">Valid Until</div>
          <div class="value">${formatDate(offer.validUntil)}</div>
        </div>
      </div>

      <div class="offer-actions">
        <a class="btn secondary" href="/offer/${offer.id}" target="_blank">Client Page</a>
        <a class="btn secondary" href="/api/offers/${offer.id}/pdf" target="_blank">PDF</a>
        <button class="btn secondary copy-link" data-link="${link}">Copy Link</button>
      </div>
    </div>
  `;
}

async function loadStats() {
  const res = await fetch("/api/offers/stats");
  const data = await res.json();

  adminStats.innerHTML = `
    <div class="kpi">
      <div class="label">Total Offers</div>
      <div class="value">${data.totalOffers || 0}</div>
    </div>

    <div class="kpi">
      <div class="label">Active Offers</div>
      <div class="value">${data.activeOffers || 0}</div>
    </div>

    <div class="kpi">
      <div class="label">Revenue Potential</div>
      <div class="value">${Number(data.totalRevenuePotential || 0).toFixed(2)} EUR</div>
    </div>

    <div class="kpi">
      <div class="label">Margin Potential</div>
      <div class="value">${Number(data.totalMarginPotential || 0).toFixed(2)} EUR</div>
    </div>

    <div class="kpi">
      <div class="label">Booked Revenue</div>
      <div class="value">${Number(data.bookedRevenue || 0).toFixed(2)} EUR</div>
    </div>

    <div class="kpi">
      <div class="label">Lost Revenue</div>
      <div class="value">${Number(data.lostRevenue || 0).toFixed(2)} EUR</div>
    </div>
  `;
}

function miniList(title, items) {
  return `
    <div class="kpi">
      <div class="label">${title}</div>
      <div style="margin-top:10px; display:grid; gap:8px;">
        ${items.length ? items.map(o => `
          <div style="font-size:13px; line-height:1.35;">
            <b>${o.destination || "Untitled"}</b><br>
            <span style="opacity:.75">${o.clientName || "No client"}</span><br>
            <span style="opacity:.75">${Number(o.price || 0).toFixed(2)} ${o.currency || "EUR"}</span>
          </div>
        `).join("") : `<div class="empty">No data</div>`}
      </div>
    </div>
  `;
}

async function loadHotDeals() {
  try {
    const res = await fetch("/api/offers/hot-deals");
    const data = await res.json();

    hotDealWidgets.innerHTML = `
      ${miniList("🔥 Hot Deals", data.hotDeals || [])}
      ${miniList("⏰ Expiring Soon", data.expiringSoon || [])}
      ${miniList("💰 High Margin", data.highMargin || [])}
      ${miniList("📞 Follow-up Required", data.followUpRequired || [])}
    `;
  } catch (e) {
    hotDealWidgets.innerHTML = "";
  }
}

async function loadOffers() {
  const params = new URLSearchParams();

  filterIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const value = el.value;
    if (value) params.set(id, value);
  });

  const res = await fetch(`/api/offers?${params.toString()}`);
  const data = await res.json();
  const offers = Array.isArray(data) ? data : (data.offers || []);

  if (!offers.length) {
    adminOffers.innerHTML = '<div class="empty">No matching offers.</div>';
    return;
  }

  adminOffers.innerHTML = offers.map(row).join("");

  document.querySelectorAll(".status-select").forEach((sel) =>
    sel.addEventListener("change", async () => {
      await fetch(`/api/offers/${sel.dataset.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: sel.value })
      });

loadOffers();
loadStats();
loadHotDeals();
    })
  );

  document.querySelectorAll(".copy-link").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(btn.dataset.link);
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = "Copy Link";
      }, 1200);
    })
  );
}

filterIds.forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", loadOffers);
  el.addEventListener("change", loadOffers);
});

loadOffers();
loadStats();
loadHotDeals();
