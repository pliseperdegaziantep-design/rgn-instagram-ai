const express = require("express");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.get("/", (_req, res) => {
  res.status(200).send("RGN Instagram AI webhook service is running.");
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!VERIFY_TOKEN) {
    console.error("VERIFY_TOKEN environment variable is missing.");
    return res.sendStatus(500);
  }

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully.");
    return res.status(200).send(challenge);
  }

  console.warn("Webhook verification failed.", { mode, tokenMatches: token === VERIFY_TOKEN });
  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  // Meta expects a fast 200 response. Message processing will be added next.
  console.log("Instagram webhook event:", JSON.stringify(req.body));
  return res.sendStatus(200);
});

app.use((_req, res) => {
  res.status(404).send("Not Found");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`RGN Instagram AI is listening on port ${PORT}`);
});
