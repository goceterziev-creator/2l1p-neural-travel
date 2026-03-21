function calculatePrice(flight,hotel){

let base = flight.price + hotel.price
let markup = 0.05

let final = base * (1+markup)

return {
base,
final,
margin: final-base
}

}

module.exports = { calculatePrice }