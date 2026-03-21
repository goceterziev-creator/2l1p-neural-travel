function searchFlights(plan){

let price = 320

if(plan.route.includes("Athens")){
price += 80
}

return {
route: plan.route,
airline: "Aegean Airlines",
price
}

}

module.exports = { searchFlights }