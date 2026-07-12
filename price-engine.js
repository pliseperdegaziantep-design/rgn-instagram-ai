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
    HONEYCOMP: 1100,
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

function normalizeNumber(value) {
  return Number(String(value).replace(",", "."));
}

function roundDimensionUpTo10(valueCm) {
  return Math.ceil(valueCm / 10) * 10;
}

function calculatePieceSquareMeters(widthCm, heightCm) {
  const roundedWidth = roundDimensionUpTo10(widthCm);
  const roundedHeight = roundDimensionUpTo10(heightCm);
  const rawSquareMeters = (roundedWidth / 100) * (roundedHeight / 100);
  return rawSquareMeters < 1 ? 1 : rawSquareMeters;
}

function pushMeasurementCopies(measurements, width, height, quantity) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(quantity) ||
    width <= 0 ||
    height <= 0 ||
    quantity <= 0
  ) {
    return;
  }

  for (let index = 0; index < quantity; index += 1) {
    measurements.push({ width, height });
  }
}

function extractMeasurements(text) {
  const source = String(text || "");
  const measurements = [];

  // 3 adet 55x145 / 55x145 3 adet / 55 × 145
  const xPattern = /(?:(\d+)\s*(?:adet|tane|cam)\s*(?:var\s*)?)?(\d+(?:[.,]\d+)?)\s*(?:cm\s*)?[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*cm)?(?:\s*[-–:]?\s*(\d+)\s*(?:adet|tane|cam))?/gi;
  let match;

  while ((match = xPattern.exec(source)) !== null) {
    const quantity = Number(match[1] || match[4] || 1);
    const width = normalizeNumber(match[2]);
    const height = normalizeNumber(match[3]);
    pushMeasurementCopies(measurements, width, height, quantity);
  }

  // Müşterilerin sık kullandığı doğal yazım:
  // "3 adet 55.5cm en 144.5 boy"
  // "7 adet 61,5 cm en. 144,5 boy"
  const enBoyPattern = /(?:(\d+)\s*(?:adet|tane|cam)\s*)?(\d+(?:[.,]\d+)?)\s*(?:cm\s*)?en\.?\s*[,;:\-]?\s*(\d+(?:[.,]\d+)?)\s*(?:cm\s*)?boy\.?/gi;

  while ((match = enBoyPattern.exec(source)) !== null) {
    const quantity = Number(match[1] || 1);
    const width = normalizeNumber(match[2]);
    const height = normalizeNumber(match[3]);
    pushMeasurementCopies(measurements, width, height, quantity);
  }

  return measurements;
}

function extractCamCount(text) {
  const matches = [...String(text || "").matchAll(/\b(\d+)\s*(?:adet\s*)?(?:cam|kanat)\b/gi)];
  if (matches.length === 0) return null;
  const count = Number(matches[matches.length - 1][1]);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function getUserMessages(messages) {
  return messages.filter((message) => message?.role === "user");
}

function getUserTranscript(messages) {
  return getUserMessages(messages)
    .map((message) => String(message?.content || ""))
    .join("\n");
}

function detectLatestSeries(messages) {
  let selectedSeries = null;

  for (const message of messages) {
    const content = String(message?.content || "");
    for (const [series, pattern] of SERIES_PATTERNS) {
      if (pattern.test(content)) selectedSeries = series;
    }
  }

  return selectedSeries;
}

function detectServiceType(messages) {
  let serviceType = null;

  for (const message of getUserMessages(messages)) {
    const content = String(message?.content || "");
    if (/montajlı|montajli|montaj dahil/i.test(content)) serviceType = "montajli";
    if (/montajsız|montajsiz|demonte|kargolu/i.test(content)) serviceType = "demonte";
  }

  return serviceType;
}

function isPriceRequest(text) {
  return /fiyat|tutar|kaç tl|kac tl|ne kadar|hesap|ücret|ucret/i.test(text);
}

function hasPriceContext(messages) {
  return getUserMessages(messages).some((message) =>
    isPriceRequest(String(message?.content || ""))
  );
}

function isShortFollowUp(text) {
  return /^(tamam|tamam olur|olur|evet|peki|aynen|uygun|hesapla|fiyat ver|söyle|soyle)[.!😊🙂👍\s]*$/i.test(text);
}

function findLatestMeasurementText(messages) {
  const userMessages = getUserMessages(messages);

  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const content = String(userMessages[index]?.content || "").trim();
    if (extractMeasurements(content).length > 0) return content;
  }

  return "";
}

function findLatestCamCount(messages) {
  const userMessages = getUserMessages(messages);

  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const count = extractCamCount(userMessages[index]?.content);
    if (count) return count;
  }

  return null;
}

function formatTry(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(value);
}

function buildDeterministicPriceReply(messages) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message?.role === "user");

  const latestText = String(latestUserMessage?.content || "").trim();
  if (!latestText) return null;

  const latestMeasurements = extractMeasurements(latestText);
  const latestCamCount = extractCamCount(latestText);
  const priceContext = hasPriceContext(messages);
  const shouldHandlePrice =
    isPriceRequest(latestText) ||
    latestMeasurements.length > 0 ||
    latestCamCount !== null ||
    (priceContext && isShortFollowUp(latestText));

  if (!shouldHandlePrice) return null;

  const serviceType = detectServiceType(messages);
  const userTranscript = getUserTranscript(messages);

  if (!serviceType) {
    return "Tabii 😊 Fiyatı doğru hesaplamam için demonte mi, montajlı mı hizmet istiyorsunuz?";
  }

  if (serviceType === "montajli" && !/gaziantep/i.test(userTranscript)) {
    return "Montajlı hizmetimiz yalnızca Gaziantep içinde 😊 Uygulama Gaziantep'te mi?";
  }

  // Özel bir seri konuşulmadıysa müşteriyi bekletme. Ekonomik başlangıç serisi NOVA üzerinden ön fiyat ver.
  const series = detectLatestSeries(messages) || "NOVA";
  const unitPrice = PRICE_LIST[serviceType]?.[series];
  if (!unitPrice) return null;

  const measurementText =
    latestMeasurements.length > 0 ? latestText : findLatestMeasurementText(messages);
  const measurements = extractMeasurements(measurementText);

  let totalSquareMeters = 0;
  let quantity = 0;
  let isCamEstimate = false;

  if (measurements.length > 0) {
    quantity = measurements.length;
    totalSquareMeters = measurements.reduce(
      (sum, measurement) =>
        sum + calculatePieceSquareMeters(measurement.width, measurement.height),
      0
    );
  } else {
    const camCount = latestCamCount || findLatestCamCount(messages);
    if (!camCount) {
      return "Yaklaşık fiyat verebilmem için cam adedini veya ölçüleri yazabilir misiniz? 😊";
    }

    quantity = camCount;
    totalSquareMeters = camCount;
    isCamEstimate = true;
  }

  const calculatedTotal = totalSquareMeters * unitPrice;
  // Müşteriye verilen yaklaşık fiyatı en yakın 100 TL'ye yuvarla. Örn: 960 TL → 1.000 TL.
  const roundedAverageTotal = Math.round(calculatedTotal / 100) * 100;
  const serviceLabel = serviceType === "montajli" ? "montajlı" : "demonte";
  const estimateNote = isCamEstimate
    ? " Ölçü olmadığı için bu ortalama ön fiyattır."
    : " Ölçülerinize göre yaklaşık fiyattır.";
  const roadFeeNote =
    serviceType === "montajli" && quantity < 5
      ? "\n5 adet altı montajlı işlemlerde mesafeye göre ekstra yol ücreti çıkabilir."
      : "";

  return `${quantity} adet için ${series} ${serviceLabel} yaklaşık ${formatTry(
    roundedAverageTotal
  )} TL civarında tutar 😊${estimateNote}${roadFeeNote}\n\nSipariş için WhatsApp: 0530 028 89 03`;
}

module.exports = {
  PRICE_LIST,
  roundDimensionUpTo10,
  calculatePieceSquareMeters,
  extractMeasurements,
  extractCamCount,
  buildDeterministicPriceReply,
};