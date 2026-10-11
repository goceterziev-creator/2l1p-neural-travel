"use strict";

const { buildPresentationViewModel } = require("./presentation-view-model");

// Verified photos of the named properties, never generic imagery.
const verifiedPhotos = [
  { name: "a&o london docklands riverside", destination: /london|лондон/i, path: "/images/hotels/ao-london-docklands.jpg" },
  { name: "la reserve eden au lac zurich", destination: /zurich|zürich|цюрих/i, path: "/images/hotels/eden-au-lac-zurich.jpg" },
  { name: "maamadi boutique", destination: /maldives|малдиви|maafushi/i, path: "/images/hotels/maamadi-boutique.jpg" }
];
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function verifiedHotelImagePath(name, destination) {
  return verifiedPhotos.find(photo => normalize(name) === photo.name && photo.destination.test(String(destination || "")))?.path || "";
}

function hotelImageCandidates(hotel = {}) {
  return [...new Set([
    ...(Array.isArray(hotel.imageUrls) ? hotel.imageUrls : []),
    ...(Array.isArray(hotel.images) ? hotel.images : []),
    hotel.heroImage, hotel.image, hotel.imageUrl, hotel.photo, hotel.thumbnail
  ].filter(value => typeof value === "string").map(value => value.trim()).filter(value => /^https?:\/\//i.test(value)))].slice(0, 6);
}

async function prepareHotelPrintImages(input, options, { resolveImage, findImages, origin }) {
  const copy = JSON.parse(JSON.stringify(input));
  const view = buildPresentationViewModel(copy, options);
  const destination = copy.destination?.name || copy.destination?.requested || "";
  const indexes = view.contract.mode === "comparison"
    ? view.hotelOptions.map((_, index) => index)
    : [view.selectedHotelIndex];
  const hotels = view.hotelOptions.slice();
  await Promise.all(indexes.map(async index => {
    const hotel = hotels[index];
    if (!hotel) return;
    const existing = hotelImageCandidates(hotel);
    let images = (await Promise.all(existing.map(resolveImage))).filter(Boolean);
    const verified = verifiedHotelImagePath(hotel.name, destination);
    if (images.length < 3 && verified) images.push(new URL(verified, origin).href);
    if (!images.length && hotel.name) {
      const found = await findImages(hotel.name, destination, 6);
      images = (await Promise.all(found.slice(0, 6).map(resolveImage))).filter(Boolean);
    }
    const prepared = { ...hotel, imageUrls: [...new Set(images)].slice(0, 3), images: [] };
    for (const key of ["heroImage", "image", "imageUrl", "photo", "thumbnail"]) delete prepared[key];
    hotels[index] = prepared;
  }));
  copy.hotelOptions = hotels;
  copy.hotel = hotels[view.selectedHotelIndex] || copy.hotel;
  return copy;
}

module.exports = { hotelImageCandidates, prepareHotelPrintImages, verifiedHotelImagePath };
