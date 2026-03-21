function buildTravelPlan(request) {
  const budget = Number(request.budget || 0);
  const destination = String(request.destination || "").toLowerCase();
  const from = request.from || "Sofia";
  const guests = Number(request.guests || 2);

  let hotelStars = 3;
  let flightType = "budget";
  let route = from + " -> " + request.destination;
  let transferNeeded = false;

  if (budget >= 800) hotelStars = 4;
  if (budget >= 1800) hotelStars = 5;

  if (destination.includes("paros")) {
    route = from + " -> Athens -> Paros";
    transferNeeded = true;
  }

  if (destination.includes("santorini")) {
    route = from + " -> Athens -> Santorini";
    transferNeeded = true;
  }

  return {
    destination: request.destination,
    from,
    guests,
    dates: request.dates,
    hotelStars,
    flightType,
    transferNeeded,
    route
  };
}

module.exports = { buildTravelPlan };