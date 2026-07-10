const CHECK_VALUE = "за проверка";

const MONTHS_BG = [
  "януари",
  "февруари",
  "март",
  "април",
  "май",
  "юни",
  "юли",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември"
];

const MONTH_ALIASES = new Map([
  ["jan", 1], ["january", 1], ["януари", 1],
  ["feb", 2], ["february", 2], ["февруари", 2],
  ["mar", 3], ["march", 3], ["март", 3],
  ["apr", 4], ["april", 4], ["април", 4],
  ["may", 5], ["май", 5],
  ["jun", 6], ["june", 6], ["юни", 6],
  ["jul", 7], ["july", 7], ["юли", 7],
  ["aug", 8], ["august", 8], ["август", 8],
  ["sep", 9], ["sept", 9], ["september", 9], ["септември", 9],
  ["oct", 10], ["october", 10], ["октомври", 10],
  ["nov", 11], ["november", 11], ["ноември", 11],
  ["dec", 12], ["december", 12], ["декември", 12]
]);

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (!/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  if (!Number.isFinite(year)) return null;
  if (year >= 2024 && year <= 2100) return year;
  return null;
}

function makeDate({ day, month, year = null, source = "candidate", reviewed = false } = {}) {
  const parsedDay = Number(day);
  const parsedMonth = Number(month);
  const parsedYear = normalizeYear(year);
  if (!parsedDay || !parsedMonth || parsedDay < 1 || parsedDay > 31 || parsedMonth < 1 || parsedMonth > 12) {
    return {
      day: null,
      month: null,
      year: null,
      yearMissing: true,
      reviewed: Boolean(reviewed),
      source,
      raw: ""
    };
  }
  return {
    day: parsedDay,
    month: parsedMonth,
    year: parsedYear,
    yearMissing: !parsedYear,
    reviewed: Boolean(reviewed),
    source,
    raw: ""
  };
}

function normalizeTravelDate(value = "", options = {}) {
  if (value && typeof value === "object" && value.day && value.month) {
    return makeDate({
      day: value.day,
      month: value.month,
      year: value.year ?? options.reviewedYear ?? null,
      reviewed: value.reviewed || options.reviewed,
      source: value.source || (options.reviewed ? "manual" : "candidate")
    });
  }

  const raw = clean(value);
  if (!raw) return makeDate({ source: "missing" });
  if (/^\d{1,2}:\d{2}(?:\s*(?:AM|PM))?$/i.test(raw)) return makeDate({ source: "missing" });

  const manualYear = normalizeYear(options.reviewedYear);
  const deterministicYear = normalizeYear(options.trustedOfferYear);

  let match = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]|$)/);
  if (match) {
    const result = makeDate({ year: match[1], month: match[2], day: match[3], source: "explicit" });
    result.raw = raw;
    return result;
  }

  match = raw.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (match) {
    let day = match[1];
    let month = match[2];
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12 && second <= 12) {
      day = match[1];
      month = match[2];
    } else if (second > 12 && first <= 12) {
      day = match[2];
      month = match[1];
    }
    const explicitYear = normalizeYear(match[3]);
    const result = makeDate({
      day,
      month,
      year: explicitYear || manualYear || deterministicYear || null,
      reviewed: Boolean(manualYear),
      source: explicitYear ? "explicit" : manualYear ? "manual" : deterministicYear ? "offer-period" : "partial"
    });
    result.raw = raw;
    return result;
  }

  match = raw.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?[,]?\s*(\d{1,2})\s+([A-Za-z]+|януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)(?:\s+(\d{2,4})(?:\s*г\.?)?)?/i);
  if (match) {
    const month = MONTH_ALIASES.get(String(match[2]).toLowerCase());
    const explicitYear = normalizeYear(match[3]);
    const result = makeDate({
      day: match[1],
      month,
      year: explicitYear || manualYear || deterministicYear || null,
      reviewed: Boolean(manualYear),
      source: explicitYear ? "explicit" : manualYear ? "manual" : deterministicYear ? "offer-period" : "partial"
    });
    result.raw = raw;
    return result;
  }

  return {
    day: null,
    month: null,
    year: null,
    yearMissing: true,
    reviewed: Boolean(options.reviewed),
    source: "unparsed",
    raw
  };
}

function isCompleteTravelDate(value) {
  const date = typeof value === "object" ? value : normalizeTravelDate(value);
  return Boolean(date.day && date.month && date.year);
}

function formatDateBg(value = "", options = {}) {
  const date = typeof value === "object" ? normalizeTravelDate(value, options) : normalizeTravelDate(value, options);
  if (!date.day || !date.month) return clean(date.raw) || CHECK_VALUE;
  const month = MONTHS_BG[date.month - 1] || String(date.month);
  return date.year ? `${date.day} ${month} ${date.year} г.` : `${date.day} ${month}`;
}

function extractTime(value = "") {
  const text = clean(value);
  const iso = text.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const match = text.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const meridiem = String(match[3] || "").toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function formatDateTimeBg(value = "", options = {}) {
  const date = formatDateBg(value, options);
  const time = extractTime(value);
  return [date, time].filter((part) => part && part !== CHECK_VALUE).join(" ");
}

function compareTravelDates(a, b) {
  const first = typeof a === "object" ? normalizeTravelDate(a) : normalizeTravelDate(a);
  const second = typeof b === "object" ? normalizeTravelDate(b) : normalizeTravelDate(b);
  const firstKey = [first.year || 0, first.month || 0, first.day || 0].join("-");
  const secondKey = [second.year || 0, second.month || 0, second.day || 0].join("-");
  if (firstKey === secondKey) return 0;
  return firstKey < secondKey ? -1 : 1;
}

module.exports = {
  normalizeTravelDate,
  formatDateBg,
  formatDateTimeBg,
  isCompleteTravelDate,
  compareTravelDates,
  extractTime,
  CHECK_VALUE
};
