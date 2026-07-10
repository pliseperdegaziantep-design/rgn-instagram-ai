const express = require("express");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID;

// Prevent the same webhook message from being processed repeatedly.
const processedMessageIds = new Set();

app.get("/", (_req, res) => {
  res.status(200).send("RGN Instagram AI webhook service is running.");
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    instagramTokenConfigured: Boolean(INSTAGRAM_ACCESS_TOKEN),
    instagramUserIdConfigured: Boolean(INSTAGRAM_USER_ID),
  });
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

  console.warn("Webhook verification failed.", {
    mode,
    tokenMatches: token === VERIFY_TOKEN,
  });
  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  // Meta requires a fast response. Acknowledge first, then inspect events.
  res.sendStatus(200);

  try {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];

    for (const entry of entries) {
      const messagingEvents = Array.isArray(entry?.messaging)
        ? entry.messaging
        : [];

      for (const event of messagingEvents) {
        const messageId = event?.message?.mid;
        const senderId = event?.sender?.id;
        const text = event?.message?.text;

        if (!messageId || !senderId) continue;
        if (processedMessageIds.has(messageId)) continue;

        processedMessageIds.add(messageId);

        // Keep memory bounded on long-running instances.
        if (processedMessageIds.size > 5000) {
          processedMessageIds.clear();
          processedMessageIds.add(messageId);
        }

        console.log("Instagram DM received:", {
          messageId,
          senderId,
          text: typeof text === "string" ? text : null,
        });
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
  }
});

app.use((_req, res) => {
  res.status(404).send("Not Found");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`RGN Instagram AI is listening on port ${PORT}`);
});
