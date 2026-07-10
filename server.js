const express = require("express");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v25.0";

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

app.get("/privacy", (_req, res) => {
  res.status(200).type("html").send(`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gizlilik Politikası | PPG CHAT AI</title>
</head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6">
  <h1>Gizlilik Politikası</h1>
  <p><strong>PPG CHAT AI</strong>, Instagram üzerinden gelen mesajlara yanıt vermek ve müşteri taleplerini yönetmek amacıyla çalışır.</p>
  <p>İşlenen veriler; kullanıcı adı, mesaj içeriği ve kullanıcı tarafından gönüllü olarak paylaşılan sipariş bilgilerinden oluşabilir.</p>
  <p>Bu veriler yalnızca müşteri desteği, fiyatlandırma, sipariş oluşturma ve ilgili hizmetlerin sunulması amacıyla kullanılır.</p>
  <p>Veriler izinsiz şekilde üçüncü taraflara satılmaz veya paylaşılmaz. Yasal zorunluluklar dışında yalnızca hizmetin çalışması için gerekli altyapı sağlayıcıları kullanılabilir.</p>
  <p>Kullanıcılar verilerinin silinmesini talep edebilir.</p>
  <p>İletişim: <a href="mailto:elexusperde@gmail.com">elexusperde@gmail.com</a></p>
  <p>Son güncelleme: 10 Temmuz 2026</p>
</body>
</html>`);
});

app.get("/data-deletion", (_req, res) => {
  res.status(200).type("html").send(`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Veri Silme Talimatları | PPG CHAT AI</title>
</head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6">
  <h1>Veri Silme Talimatları</h1>
  <p>PPG CHAT AI tarafından işlenen kişisel verilerinizin silinmesini talep etmek için aşağıdaki e-posta adresine yazabilirsiniz:</p>
  <p><a href="mailto:elexusperde@gmail.com">elexusperde@gmail.com</a></p>
  <p>Talebinizde Instagram kullanıcı adınızı ve silinmesini istediğiniz bilgileri belirtin. Talebiniz doğrulandıktan sonra ilgili kayıtlar makul süre içinde silinir.</p>
</body>
</html>`);
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

async function sendInstagramText(recipientId, text) {
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID is missing.");
  }

  const url = `https://graph.instagram.com/${GRAPH_API_VERSION}/${encodeURIComponent(
    INSTAGRAM_USER_ID
  )}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const responseText = await response.text();
  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    result = responseText;
  }

  if (!response.ok) {
    throw new Error(
      `Instagram send failed (${response.status}): ${JSON.stringify(result)}`
    );
  }

  return result;
}

async function processWebhook(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  for (const entry of entries) {
    const messagingEvents = Array.isArray(entry?.messaging)
      ? entry.messaging
      : [];

    for (const event of messagingEvents) {
      const messageId = event?.message?.mid;
      const senderId = event?.sender?.id;
      const text = event?.message?.text;
      const isEcho = Boolean(event?.message?.is_echo);

      if (!messageId || !senderId || isEcho) continue;
      if (String(senderId) === String(INSTAGRAM_USER_ID)) continue;
      if (processedMessageIds.has(messageId)) continue;

      processedMessageIds.add(messageId);

      if (processedMessageIds.size > 5000) {
        processedMessageIds.clear();
        processedMessageIds.add(messageId);
      }

      console.log("Instagram DM received:", {
        messageId,
        senderId,
        text: typeof text === "string" ? text : null,
      });

      const reply =
        "Merhaba 👋 Mesajınız bize ulaştı. Size yardımcı olabilmemiz için uygulama alanını yazar mısınız? Cam balkon, PVC pencere veya farklı bir alan mı?";

      try {
        const sendResult = await sendInstagramText(senderId, reply);
        console.log("Instagram automatic reply sent:", sendResult);
      } catch (error) {
        console.error("Instagram automatic reply error:", error.message);
      }
    }
  }
}

app.post("/webhook", (req, res) => {
  // Meta expects a fast response. Process the event after acknowledging it.
  res.sendStatus(200);
  void processWebhook(req.body).catch((error) => {
    console.error("Webhook processing error:", error);
  });
});

app.use((_req, res) => {
  res.status(404).send("Not Found");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`RGN Instagram AI is listening on port ${PORT}`);
});
