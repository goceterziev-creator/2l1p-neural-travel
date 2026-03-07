const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const offersRouter = require("./routes/offers");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    service: "2L1P Neural Travel V3",
    port: PORT,
    version: "3.6.0"
  });
});

app.use("/api/offers", offersRouter);

app.get("/offer/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "offer.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`2L1P Neural Travel V3 running on http://localhost:${PORT}`);
});