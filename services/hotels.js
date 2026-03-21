function searchHotel(plan){

let hotel = "Comfort Stay"
let price = 350

if(plan.hotelStars === 4){
hotel = "Bay Hotel"
price = 580
}

if(plan.hotelStars === 5){
hotel = "Luxury Suites"
price = 980
}

return {
hotel,
price,
stars: plan.hotelStars
}

}

module.exports = { searchHotel }