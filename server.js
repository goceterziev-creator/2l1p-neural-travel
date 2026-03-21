const express = require("express");
const cors = require("cors");
const requests = require("./routes/requests");
const offers = require("./routes/offers");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.use("/api/requests", requests);
app.use("/api/offers", offers);

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", service: "2L1P Neural Travel", port: PORT });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});