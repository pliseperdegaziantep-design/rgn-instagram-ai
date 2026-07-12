const PRICE_LIST = Object.freeze({
  demonte: Object.freeze({
    NOVA: 485,
    "NEO FASHION": 545,
    "NANO CLEAN": 545,
    "NANO INSULATION": 645,
    "NANO PRO": 845,
    HONEYCOMP: 1000,
  }),
  montajli: Object.freeze({
    NOVA: 580,
    "NEO FASHION": 640,
    "NANO CLEAN": 640,
    "NANO INSULATION": 740,
    "NANO PRO": 905,
    HONEYCOMP: 1060,
  }),
});

const PRODUCT_URL = "https://pliseperdegaziantep.com/urunler";
const WHATSAPP_PHONE = "0530 028 89 03";

const SERIES_PATTERNS = [
  ["NANO INSULATION", /nano\s*insulation/i],
  ["NEO FASHION", /neo\s*fashion/i],
  ["NANO CLEAN", /nano\s*clean/i],
  ["NANO PRO", /nano\s*pro/i],
  ["HONEYCOMP", /honey\s*comp|honeycomp|honeycomb/i],
  ["NOVA", /\bnova\b/i],
];

const NUMBER_WORDS = Object.freeze({ bir:1, iki:2, üç:3, uc:3, dört:4, dort:4, beş:5, bes:5, altı:6, alti:6, yedi:7, sekiz:8, dokuz:9, on:10, onbir:11, "on bir":11, oniki:12, "on iki":12, onüç:13, "on üç":13, ondört:14, "on dört":14, onbeş:15, "on beş":15, onaltı:16, "on altı":16, onyedi:17, "on yedi":17, onsekiz:18, "on sekiz":18, ondokuz:19, "on dokuz":19, yirmi:20 });

function getUserMessages(messages) {
  return messages.filter((message) => message?.role === "user");
}

function detectLatest(messages, detectors, roles = ["user"]) {
  let value = null;
  for (const message of messages) {
    if (!roles.includes(message?.role)) continue;
    const content = String(message?.content || "");
    for (const [result, pattern] of detectors) {
      if (pattern.test(content)) value = result;
    }
  }
  return value;
}

function detectSeries(messages) {
  return detectLatest(messages, SERIES_PATTERNS, ["user"]);
}

function isPriceRequest(text) {
  return /fiyat|tutar|kaç tl|kac tl|ne kadar|hesap|ücret|ucret|maliyet|ortalama/i.test(String(text || ""));
}

function isFabricListRequest(text) {
  return /kumaş\s*(?:çeşit|cesit|seri|model)|hangi\s*kumaş|hangi\s*seri|serileriniz|kumaşlarınız|kumaslariniz|ürün\s*çeşit/i.test(String(text || ""));
}

function isOrderIntent(text) {
  return /sipariş\s*(?:ver|oluştur|oluşturalım|oluşturalim)|almak\s*istiyorum|satın\s*almak|satin\s*almak|tamam\s*alayım|tamam\s*alayim|siparişimi/i.test(String(text || ""));
}

function buildFabricListReply() {
  return "NOVA 485 TL – ekonomik\nNEO FASHION 545 TL – desenli\nNANO CLEAN 545 TL – kolay temizlenir\nNANO INSULATION 645 TL – yalıtımlı\nNANO PRO 845 TL – güçlü güneş kontrolü / karartma\nHONEYCOMP 1.000 TL – premium\n\nTüm kumaşlarımız yıkanabilir ve 2 yıl garantilidir 😊";
}

function extractCamCount(text) {
  const source = String(text || "").toLocaleLowerCase("tr-TR").trim();
  const numericMatches = [...source.matchAll(/\b(\d+)\s*(?:adet\s*)?(?:cam|kanat|parça|perde)?\b/gi)];
  for (let index = numericMatches.length - 1; index >= 0; index -= 1) {
    const value = Number(numericMatches[index][1]);
    if (Number.isFinite(value) && value > 0 && value <= 500) return value;
  }

  const entries = Object.entries(NUMBER_WORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [word, value] of entries) {
    const escaped = word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const pattern = new RegExp(`(?:^|\\s)${escaped}(?:\\s+(?:adet|cam|kanat|parça|perde))?(?:$|\\s)`, "i");
    if (pattern.test(source)) return value;
  }
  return null;
}

function findLatestCamCount(messages) {
  const userMessages = getUserMessages(messages);
  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const count = extractCamCount(userMessages[index]?.content);
    if (count) return count;
  }
  return null;
}

function formatMoney(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(value);
}

function roundFriendlyAverage(total) {
  if (total >= 5000) return total;
  const remainder = total % 100;
  if (remainder === 50) return total;
  return Math.round(total / 100) * 100;
}

function avoidRepeatedReply(messages, reply) {
  const normalized = String(reply || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
  const repeated = messages.some((message) => {
    if (message?.role !== "assistant") return false;
    return String(message?.content || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR") === normalized;
  });

  return repeated
    ? `Detaylı bilgi için WhatsApp: ${WHATSAPP_PHONE}`
    : reply;
}

function buildDeterministicPriceReply(messages) {
  const latestUserMessage = [...messages].reverse().find((message) => message?.role === "user");
  const latestText = String(latestUserMessage?.content || "").trim();
  if (!latestText) return null;

  if (isOrderIntent(latestText)) {
    return `Sipariş için WhatsApp: ${WHATSAPP_PHONE}`;
  }

  if (isFabricListRequest(latestText)) {
    return avoidRepeatedReply(messages, buildFabricListReply());
  }

  const priceContext = getUserMessages(messages).some((message) => isPriceRequest(message?.content));
  if (!priceContext) return null;

  const camCount = findLatestCamCount(messages);

  if (!camCount) {
    return avoidRepeatedReply(
      messages,
      "Merhaba 😊 Kaç adet camınız var? Hangi şehirden ulaşıyorsunuz?"
    );
  }

  const series = detectSeries(messages) || "NOVA";
  const unitPrice = PRICE_LIST.demonte[series];
  if (!unitPrice) return null;

  const averageTotal = roundFriendlyAverage(camCount * unitPrice);
  const reply = `${camCount} cam için ${series} ortalama ${formatMoney(averageTotal)} TL civarında tutar 😊 Fiyat ölçülere göre değişebilir.\n${PRODUCT_URL}`;

  return avoidRepeatedReply(messages, reply);
}

module.exports = {
  PRICE_LIST,
  extractCamCount,
  roundFriendlyAverage,
  buildDeterministicPriceReply,
};
