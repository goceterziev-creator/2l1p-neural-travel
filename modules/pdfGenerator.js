function pad(n){return String(n).padStart(2,'0');}
function formatDateSafe(d){const x=new Date(d); if(isNaN(x)) return '-'; return pad(x.getDate())+'.'+pad(x.getMonth()+1)+'.'+x.getFullYear()+' '+pad(x.getHours())+':'+pad(x.getMinutes());}
const PDFDocument = require("pdfkit");
function createOfferPdf(res, offer) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${offer.id}.pdf"`);
  doc.pipe(res);
  doc.fontSize(22).text("2L1P Neural Travel", { align: "center" });
  doc.moveDown(0.2); doc.fontSize(11).text("Premium Travel Offer", { align: "center" }); doc.moveDown(1.5);
  doc.fontSize(14).text("Client"); doc.fontSize(11).text(`Name: ${offer.clientName || "N/A"}`); doc.text(`Phone: ${offer.clientPhone || "N/A"}`); doc.moveDown();
  doc.fontSize(14).text("Trip Details"); doc.fontSize(11).text(`Destination: ${offer.destination || "N/A"}`); doc.text(`Flight Route: ${offer.flightRoute || "N/A"}`); doc.text(`Hotel: ${offer.hotel || "No hotel selected"}`); doc.text(`Travel Dates: ${offer.travelDates || "N/A"}`); doc.text(`Guests: ${offer.guests || "N/A"}`); doc.moveDown();
  doc.fontSize(14).text("Pricing"); doc.fontSize(11).text(`Base Price: ${offer.basePrice} ${offer.currency}`); doc.text(`Markup: ${offer.markupPercent}%`); doc.text(`Final Client Price: ${offer.price} ${offer.currency}`); doc.text(`Status: ${offer.effectiveStatus || offer.status}`); doc.text(`Valid Until: ${formatDateSafe(offer.validUntil)}`); doc.moveDown();
  doc.fontSize(14).text("Notes"); doc.fontSize(11).text(offer.notes || "No additional notes.", { width: 500, align: "left" });
  doc.moveDown(2); doc.fontSize(10).text(`Offer ID: ${offer.id}`); doc.text(`Created: ${formatDateSafe(offer.createdAt)}`); if (offer.updatedAt) doc.text(`Updated: ${formatDateSafe(offer.updatedAt)}`);
  doc.end();
}
module.exports = { createOfferPdf };

