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
  const xPattern = /(?:(\d+)\s*(?:adet|tane|cam)\s*(?:var\s*)?)?(\d+(?:[.,]\d+)?)\s*(?:cm\s*)?[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*cm)?(?:\s*[-–:]?\s*(\d+)\s*(?:adet|tane|cam))?/gi;
  let match;

  while ((match = xPattern.exec(source)) !== null) {
    const quantity = Number(match[1] || match[4] || 1);
    const width = normalizeNumber(match[2]);
    const height = normalizeNumber(match[3]);
    pushMeasurementCopies(measurements, width, height, quantity);
  }

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

function isPriceRequest(text) {
  return /fiyat|tutar|kaç tl|kac tl|ne kadar|hesap|ücret|ucret|maliyet/i.test(text);
}

function hasPriceContext(messages) {
  return getUserMessages(messages).some((message) =>
    isPriceRequest(String(message?.content || ""))
  );
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

function isShortFollowUp(text) {
  return /^(tamam|tamam olur|olur|evet|peki|aynen|uygun|hesapla|fiyat ver|söyle|soyle)[.!😊🙂👍\s]*$/i.test(text);
}

function buildDeterministicPriceReply(messages) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message?.role === "user");

  const latestText = String(latestUserMessage?.content || "").trim();
  if (!latestText) return null;

  const measurements = extractMeasurements(latestText);
  const camCount = extractCamCount(latestText);
  const priceContext = hasPriceContext(messages);

  const shouldRoutePricing =
    isPriceRequest(latestText) ||
    (priceContext && (measurements.length > 0 || camCount !== null || isShortFollowUp(latestText)));

  if (!shouldRoutePricing) return null;

  const series = detectLatestSeries(messages);

  if (series) {
    return `${series} serisi için net fiyatınızı ölçünüze göre WhatsApp'tan hızlıca hazırlıyoruz 😊\n\n0530 028 89 03`;
  }

  return "Tabii 😊 Ekonomik ve günlük kullanım için Nova serimiz güzel bir başlangıç seçeneği. Net fiyatınızı ölçünüze göre WhatsApp'tan hızlıca hazırlıyoruz:\n\n0530 028 89 03";
}

module.exports = {
  PRICE_LIST,
  roundDimensionUpTo10,
  calculatePieceSquareMeters,
  extractMeasurements,
  extractCamCount,
  buildDeterministicPriceReply,
};
