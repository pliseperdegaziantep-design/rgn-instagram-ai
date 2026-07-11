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

  // KESİN KURAL: minimum 1 m² HER TEK PARÇAYA ayrı uygulanır.
  return rawSquareMeters < 1 ? 1 : rawSquareMeters;
}

function extractMeasurements(text) {
  const measurements = [];
  const pattern = /(?:(\d+)\s*(?:adet|tane|cam)\s*(?:var\s*)?)?(\d+(?:[.,]\d+)?)\s*(?:cm\s*)?[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*cm)?(?:\s*[-–:]?\s*(\d+)\s*(?:adet|tane|cam))?/gi;
  let match;

  while ((match = pattern.exec(String(text || ""))) !== null) {
    const quantityBefore = match[1] ? Number(match[1]) : null;
    const width = normalizeNumber(match[2]);
    const height = normalizeNumber(match[3]);
    const quantityAfter = match[4] ? Number(match[4]) : null;
    const quantity = quantityBefore || quantityAfter || 1;

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      continue;
    }

    for (let index = 0; index < quantity; index += 1) {
      measurements.push({ width, height });
    }
  }

  return measurements;
}

function getTranscript(messages) {
  return messages
    .map((message) => String(message?.content || ""))
    .join("\n");
}

function getUserMessages(messages) {
  return messages.filter((message) => message?.role === "user");
}

function detectLatestSeries(messages) {
  let selectedSeries = null;

  for (const message of messages) {
    const content = String(message?.content || "");
    for (const [series, pattern] of SERIES_PATTERNS) {
      if (pattern.test(content)) {
        selectedSeries = series;
      }
    }
  }

  return selectedSeries;
}

function detectServiceType(messages) {
  let serviceType = null;

  // Önce sadece müşterinin açık ifadesini esas al.
  for (const message of getUserMessages(messages)) {
    const content = String(message?.content || "");

    if (/montajlı|montajli|montaj dahil/i.test(content)) {
      serviceType = "montajli";
    }

    if (/montajsız|montajsiz|demonte|kargolu|şehir dışı|sehir disi/i.test(content)) {
      serviceType = "demonte";
    }
  }

  if (serviceType) return serviceType;

  // Gaziantep içi konuşmalarda açıkça demonte denmediyse montajlı hizmeti baz al.
  const userTranscript = getUserMessages(messages)
    .map((message) => String(message?.content || ""))
    .join("\n");

  if (/gaziantep/i.test(userTranscript)) return "montajli";

  return null;
}

function isPriceRequest(text) {
  return /fiyat|tutar|kaç tl|kac tl|ne kadar|hesap|ücret|ucret/i.test(text);
}

function hasPriceContext(messages) {
  return messages.some((message) => isPriceRequest(String(message?.content || "")));
}

function isShortFollowUp(text) {
  return /^(tamam|tamam olur|olur|evet|peki|aynen|uygun|hesapla|fiyat ver|söyle|soyle)[.!😊🙂👍\s]*$/i.test(text);
}

function findLatestMeasurementText(messages) {
  const userMessages = getUserMessages(messages);

  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const content = String(userMessages[index]?.content || "").trim();
    if (extractMeasurements(content).length > 0) {
      return content;
    }
  }

  return "";
}

function formatTry(value) {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
  }).format(value);
}

function buildDeterministicPriceReply(messages) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message?.role === "user");

  const latestText = String(latestUserMessage?.content || "").trim();
  if (!latestText) return null;

  const latestMeasurements = extractMeasurements(latestText);
  const shouldCalculate =
    isPriceRequest(latestText) ||
    latestMeasurements.length > 0 ||
    (hasPriceContext(messages) && isShortFollowUp(latestText));

  if (!shouldCalculate) return null;

  // Yeni ölçü geldiyse SADECE o mesajdaki ölçüyü hesapla.
  // Kısa devam cevabında ise son ölçü mesajını kullan.
  const measurementText =
    latestMeasurements.length > 0 ? latestText : findLatestMeasurementText(messages);
  const measurements = extractMeasurements(measurementText);

  if (measurements.length === 0) return null;

  const series = detectLatestSeries(messages);
  const serviceType = detectServiceType(messages);

  if (!series || !serviceType) return null;

  const unitPrice = PRICE_LIST[serviceType]?.[series];
  if (!unitPrice) return null;

  const totalSquareMeters = measurements.reduce((sum, measurement) => {
    return (
      sum +
      calculatePieceSquareMeters(measurement.width, measurement.height)
    );
  }, 0);

  const exactTotal = totalSquareMeters * unitPrice;
  const roundedTotal = Math.round(exactTotal / 10) * 10;
  const serviceLabel = serviceType === "montajli" ? "montajlı" : "demonte";
  const quantityLabel = measurements.length > 1 ? `${measurements.length} adet` : "tek adet";

  return `${quantityLabel} için ${series} ${serviceLabel} yaklaşık ${formatTry(
    roundedTotal
  )} TL tutar 😊\n\nNet sipariş detaylarını WhatsApp'ta birlikte tamamlayabiliriz: 0530 028 89 03`;
}

module.exports = {
  PRICE_LIST,
  roundDimensionUpTo10,
  calculatePieceSquareMeters,
  extractMeasurements,
  buildDeterministicPriceReply,
};
