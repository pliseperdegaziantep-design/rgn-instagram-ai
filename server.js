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
const conversationHistories = new Map();
const MAX_HISTORY_MESSAGES = 12;
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;

const BUSINESS_CONTEXT = `
Sen Plise Perde Gaziantep markasının Instagram satış asistanısın.

MARKA VE HİZMET:
- Gaziantep içinde montajlı plise perde hizmeti verilir.
- Türkiye'nin 81 iline ölçüye özel demonte ürün kargolanır.
- Ücretsiz ölçü desteği sağlanır.
- Üretim süresi genel olarak 7 iş günüdür.
- Ürünlerde 2 yıl garanti bulunur.
- Kapıda ödeme seçeneği vardır.
- Müşteri ödeme yapmadan önce ölçü, model, renk ve fiyat bilgisi netleştirilir.

UYGULAMA ALANLARI:
- Cam balkon
- PVC pencere
- Kış bahçesi
- Ofis ve iş yeri
- Alüminyum doğrama

MONTAJ TİPLERİ:
- Vidalı sistem
- Kancalı delmesiz sistem
- Çift kancalı sistem

KUMAŞ SERİLERİ:
- Nova: düz güneşlik kumaş, ekonomik seçenek, yaklaşık %60 kapatma.
- Neo Fashion: desenli, şık görünüm, yaklaşık %70 kapatma ve ısı desteği.
- Nano Clean: leke tutmaya karşı dayanıklı, kolay temizlenen kumaş.
- Nano Insulation: ısı yalıtımı öncelikli kumaş, yaklaşık %70 kapatma.
- Nano Pro: yüksek karartma, yaklaşık %80-%95 kapatma.
- Honeycomb: petek yapılı, karartma ve ısı yalıtımı güçlü premium seçenek.

SATIŞ AKIŞI:
1. Önce müşterinin uygulama alanını öğren.
2. Sonra şehir bilgisini öğren: Gaziantep mi, şehir dışı mı?
3. İhtiyacı öğren: mahremiyet, güneş, ısı, karartma, kolay temizlik veya şıklık.
4. Uygun kumaş serisini kısa şekilde öner.
5. Fiyat için ölçü iste. Ölçü yoksa ücretsiz ölçü videosu desteği sun.
6. Sipariş aşamasında ad-soyad, telefon, açık adres, kumaş/model, profil rengi, montaj tipi ve ölçüleri tamamlat.

DAVRANIŞ KURALLARI:
- Türkçe, kısa, doğal, samimi ve satış odaklı konuş.
- Her mesajda en fazla bir ana soru sor.
- Müşterinin daha önce verdiği bilgiyi yeniden sorma.
- Uzun paragraf, robotik dil ve gereksiz emoji kullanma.
- Bilmediğin veya kesin olmayan fiyatı uydurma.
- Ölçü olmadan kesin toplam fiyat verme.
- Müşteri insan desteği isterse 0530 028 89 03 numaralı WhatsApp hattına yönlendir.
- Müşteri kızgınsa tartışma; özür dile, kısa çözüm sun ve insan desteğine aktar.
- Sadece plise perde ve ilgili satış/destek konularında yardımcı ol.
`;

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
    activeConversations: conversationHistories.size,
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

function getConversation(senderId) {
  const now = Date.now();
  const current = conversationHistories.get(senderId);

  if (!current || now - current.updatedAt > HISTORY_TTL_MS) {
    const fresh = { messages: [], updatedAt: now };
    conversationHistories.set(senderId, fresh);
    return fresh;
  }

  current.updatedAt = now;
  return current;
}

function appendConversationMessage(senderId, role, content) {
  const conversation = getConversation(senderId);
  conversation.messages.push({ role, content });
  conversation.messages = conversation.messages.slice(-MAX_HISTORY_MESSAGES);
  conversation.updatedAt = Date.now();
}

function cleanupConversationHistories() {
  const expiry = Date.now() - HISTORY_TTL_MS;
  for (const [senderId, conversation] of conversationHistories.entries()) {
    if (conversation.updatedAt < expiry) {
      conversationHistories.delete(senderId);
    }
  }
}

setInterval(cleanupConversationHistories, 30 * 60 * 1000).unref();

async function createAIReply(senderId, customerMessage) {
  const fallback =
    "Merhaba 👋 Size yardımcı olabilmem için plise perdenin uygulanacağı alanı yazar mısınız?";

  if (!OPENAI_API_KEY || !customerMessage) return fallback;

  appendConversationMessage(senderId, "user", customerMessage);
  const conversation = getConversation(senderId);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: BUSINESS_CONTEXT },
        ...conversation.messages,
      ],
      max_output_tokens: 220,
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

  const reply = extractOpenAIText(result) || fallback;
  appendConversationMessage(senderId, "assistant", reply);
  return reply;
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
        reply = await createAIReply(String(senderId), text.trim());
        console.log("AI reply created:", reply);
      } catch (error) {
        console.error("OpenAI reply error:", error.message);
        reply =
          "Mesajınız bize ulaştı 😊 Size yardımcı olabilmem için uygulama alanını yazar mısınız?";
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
