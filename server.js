const express = require("express");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v25.0";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const processedMessageIds = new Set();

app.get("/", (_req, res) => {
  res.status(200).send("RGN Instagram AI webhook service is running.");
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    instagramTokenConfigured: Boolean(INSTAGRAM_ACCESS_TOKEN),
    instagramUserIdConfigured: Boolean(INSTAGRAM_USER_ID),
    openaiConfigured: Boolean(OPENAI_API_KEY),
    openaiModel: OPENAI_MODEL,
  });
});

app.get("/privacy", (_req, res) => {
  res.status(200).type("html").send(`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gizlilik Politikası | PPG CHAT AI</title></head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6">
<h1>Gizlilik Politikası</h1><p><strong>PPG CHAT AI</strong>, Instagram üzerinden gelen mesajlara yanıt vermek ve müşteri taleplerini yönetmek amacıyla çalışır.</p>
<p>İşlenen veriler; kullanıcı adı, mesaj içeriği ve kullanıcı tarafından gönüllü olarak paylaşılan sipariş bilgilerinden oluşabilir.</p>
<p>Bu veriler yalnızca müşteri desteği, fiyatlandırma, sipariş oluşturma ve ilgili hizmetlerin sunulması amacıyla kullanılır.</p>
<p>Veriler izinsiz şekilde üçüncü taraflara satılmaz veya paylaşılmaz.</p><p>Kullanıcılar verilerinin silinmesini talep edebilir.</p>
<p>İletişim: <a href="mailto:elexusperde@gmail.com">elexusperde@gmail.com</a></p><p>Son güncelleme: 10 Temmuz 2026</p></body></html>`);
});

app.get("/data-deletion", (_req, res) => {
  res.status(200).type("html").send(`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Veri Silme Talimatları | PPG CHAT AI</title></head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6">
<h1>Veri Silme Talimatları</h1><p>Verilerinizin silinmesini talep etmek için <a href="mailto:elexusperde@gmail.com">elexusperde@gmail.com</a> adresine Instagram kullanıcı adınızla birlikte yazabilirsiniz.</p></body></html>`);
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

async function postInstagramMessage(url, recipientId, text) {
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

  return { ok: response.ok, status: response.status, result };
}

async function sendInstagramText(recipientId, text) {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN is missing.");
  }

  // With Instagram Login, /me resolves the professional account belonging to the token.
  // This avoids failures caused by an ID copied from a different Meta API flow.
  const endpoints = [
    `https://graph.instagram.com/${GRAPH_API_VERSION}/me/messages`,
  ];

  if (INSTAGRAM_USER_ID) {
    endpoints.push(
      `https://graph.instagram.com/${GRAPH_API_VERSION}/${encodeURIComponent(
        INSTAGRAM_USER_ID
      )}/messages`
    );
  }

  let lastFailure;
  for (const url of endpoints) {
    const attempt = await postInstagramMessage(url, recipientId, text);
    if (attempt.ok) return attempt.result;
    lastFailure = attempt;
    console.warn("Instagram send endpoint failed:", {
      url: url.replace(INSTAGRAM_USER_ID || "__none__", "[IG_USER_ID]"),
      status: attempt.status,
      result: attempt.result,
    });
  }

  throw new Error(
    `Instagram send failed (${lastFailure?.status || "unknown"}): ${JSON.stringify(
      lastFailure?.result || {}
    )}`
  );
}

function extractOpenAIText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

async function createAIReply(customerMessage) {
  const fallback =
    "Merhaba 👋 Plise Perde Gaziantep'e hoş geldiniz. Size yardımcı olabilmem için uygulama alanını yazar mısınız? Cam balkon, PVC pencere, kış bahçesi veya ofis mi?";

  if (!OPENAI_API_KEY || !customerMessage) return fallback;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content:
            "Sen Plise Perde Gaziantep'in Instagram satış asistanısın. Türkçe, kısa, doğal ve samimi cevap ver. İlk hedefin uygulama alanını öğrenmek olsun: cam balkon, PVC pencere, kış bahçesi veya ofis. Bilmediğin fiyatı uydurma. Her mesajda en fazla bir soru sor. Gereksiz uzun metin ve aşırı emoji kullanma.",
        },
        { role: "user", content: customerMessage },
      ],
      max_output_tokens: 180,
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
      `OpenAI request failed (${response.status}): ${JSON.stringify(result)}`
    );
  }

  return extractOpenAIText(result) || fallback;
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

      if (typeof text !== "string" || !text.trim()) continue;

      let reply;
      try {
        reply = await createAIReply(text.trim());
        console.log("AI reply created:", reply);
      } catch (error) {
        console.error("OpenAI reply error:", error.message);
        reply =
          "Merhaba 👋 Mesajınız bize ulaştı. Uygulama yapılacak alan cam balkon, PVC pencere, kış bahçesi veya ofis mi?";
      }

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
