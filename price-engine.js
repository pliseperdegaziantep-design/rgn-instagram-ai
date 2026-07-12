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

const SERIES_PATTERNS = [
  ["NANO INSULATION", /nano\s*insulation/i],
  ["NEO FASHION", /neo\s*fashion/i],
  ["NANO CLEAN", /nano\s*clean/i],
  ["NANO PRO", /nano\s*pro/i],
  ["HONEYCOMP", /honey\s*comp|honeycomp|honeycomb/i],
  ["NOVA", /\bnova\b/i],
];

const NUMBER_WORDS = Object.freeze({
  bir: 1,
  iki: 2,
  üç: 3,
  uc: 3,
  dört: 4,
  dort: 4,
  beş: 5,
  bes: 5,
  altı: 6,
  alti: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
  onbir: 11,
  "on bir": 11,
  oniki: 12,
  "on iki": 12,
  onüç: 13,
  "on üç": 13,
  ondört: 14,
  "on dört": 14,
  onbeş: 15,
  "on beş": 15,
  onaltı: 16,
  "on altı": 16,
  onyedi: 17,
  "on yedi": 17,
  onsekiz: 18,
  "on sekiz": 18,
  ondokuz: 19,
  "on dokuz": 19,
  yirmi: 20,
});

function getUserMessages(messages) {
  return messages.filter((message) => message?.role === "user");
}

function detectLatest(messages, detectors) {
  let value = null;
  for (const message of getUserMessages(messages)) {
    const content = String(message?.content || "");
    for (const [result, pattern] of detectors) {
      if (pattern.test(content)) value = result;
    }
  }
  return value;
}

function detectSeries(messages) {
  return detectLatest(messages, SERIES_PATTERNS);
}

function detectServiceType(messages) {
  return detectLatest(messages, [
    ["montajli", /montajlı|montajli|montaj dahil/i],
    ["demonte", /montajsız|montajsiz|demonte|kargolu|kargo ile/i],
  ]);
}

function detectGaziantep(messages) {
  return getUserMessages(messages).some((message) => /gaziantep/i.test(String(message?.content || "")));
}

function isPriceRequest(text) {
  return /fiyat|tutar|kaç tl|kac tl|ne kadar|hesap|ücret|ucret|maliyet/i.test(String(text || ""));
}

function extractCamCount(text) {
  const source = String(text || "").toLocaleLowerCase("tr-TR").trim();

  const numericMatches = [...source.matchAll(/\b(\d+)\s*(?:adet\s*)?(?:cam|kanat|parça|perde)?\b/gi)];
  for (let index = numericMatches.length - 1; index >= 0; index -= 1) {
    const value = Number(numericMatches[index][1]);
    if (Number.isFinite(value) && value > 0 && value <= 200) return value;
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
  const remainder = total % 100;
  // 4.850 ve 12.850 gibi doğal yarım yüzlük sonuçları olduğu gibi bırak.
  if (remainder === 50) return total;
  // 970 → 1.000, 1.940 → 2.000 gibi satış diline uygun ortalama rakam ver.
  return Math.round(total / 100) * 100;
}

function buildDeterministicPriceReply(messages) {
  const latestUserMessage = [...messages].reverse().find((message) => message?.role === "user");
  const latestText = String(latestUserMessage?.content || "").trim();
  if (!latestText) return null;

  const priceContext = getUserMessages(messages).some((message) => isPriceRequest(message?.content));
  if (!priceContext) return null;

  const camCount = findLatestCamCount(messages);
  const series = detectSeries(messages);
  const serviceType = detectServiceType(messages);

  if (!camCount) {
    return "Tabii 😊 Kaç adet camınız var?";
  }

  if (!series) {
    return "Kaç adet olduğunu aldım 😊 Hangi kumaş serisini düşünüyorsunuz? İsterseniz ihtiyacınıza göre tek bir seri önerebilirim.";
  }

  if (!serviceType) {
    return "Demonte/kargolu mu, Gaziantep içi montajlı mı düşünüyorsunuz? 😊";
  }

  if (serviceType === "montajli" && !detectGaziantep(messages)) {
    return "Montajlı hizmetimiz yalnızca Gaziantep içinde 😊 Uygulama Gaziantep'te mi?";
  }

  const unitPrice = PRICE_LIST[serviceType]?.[series];
  if (!unitPrice) return null;

  const rawTotal = camCount * unitPrice;
  const averageTotal = roundFriendlyAverage(rawTotal);
  const serviceLabel = serviceType === "montajli" ? "montaj dahil" : "demonte";

  if (serviceType === "montajli") {
    const roadFeeNote = camCount < 5
      ? " 5 adet altı montajlarda mesafeye göre ekstra yol ücreti çıkabilir."
      : "";

    return `${camCount} cam için ${series} ${serviceLabel} ortalama ${formatMoney(averageTotal)} TL tutar 😊 Fiyat cam balkon tipi ve ölçülere göre değişebilir.${roadFeeNote}\n\nNet fiyat montaj ekibimizin ölçüsü sonrası belli olur.`;
  }

  return `${camCount} cam için ${series} demonte ortalama ${formatMoney(averageTotal)} TL tutar 😊 Fiyat cam balkon tipi ve ölçülere göre değişebilir.\n\nNet fiyat için ölçülerinizi WhatsApp'tan gönderebilirsiniz: 0530 028 89 03`;
}

module.exports = {
  PRICE_LIST,
  extractCamCount,
  roundFriendlyAverage,
  buildDeterministicPriceReply,
};
