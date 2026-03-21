PROJECT

2L1P Neural Travel



VERSION

V4 FULL



TYPE

Travel Offer CRM + Booking Engine



STACK

Node.js

Express

Vanilla JS

JSON Database



SERVER

http://localhost:3001



ADMIN

http://localhost:3001/admin





ARCHITECTURE



server.js

Express server



routes/offers.js

API engine



DATABASE/database.json

Data storage





API ENDPOINTS



GET /api/health



POST /api/offers

GET /api/offers

GET /api/offers/:id



PATCH /api/offers/:id/status



POST /api/offers/:id/book



POST /api/offers/:id/click



GET /api/offers/stats

GET /api/offers/stats/summary



GET /api/offers/hot-deals

GET /api/offers/sales-board





OFFER STATUS FLOW



draft

sent

viewed

booked

lost

cancelled

expired





CLIENT FLOW



create offer

↓

client page

↓

client opens offer

↓

status → viewed

↓

client clicks BOOK

↓

status → booked





CURRENT FEATURES



offer creation

pricing markup

client page

PDF

WhatsApp share

status workflow

scoring engine

hot deals

sales board

booking button

click tracking

