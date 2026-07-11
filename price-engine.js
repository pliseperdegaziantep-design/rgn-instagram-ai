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

  // KESİN KURAL: minimum 1 m² toplam siparişe değil, HER TEK PARÇAYA uygulanır.
  return rawSquareMeters < 1 ? 1 : rawSquareMeters;
}

function extractMeasurements(text) {
  const measurements = [];
  const pattern = /(\d+(?:[.,]\d+)?)\s*(?:cm\s*)?[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*cm)?(?:\s*[-–:]?\s*(\d+)\s*(?:adet|tane))?/gi;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const width = normalizeNumber(match[1]);
    const height = normalizeNumber(match[2]);
    const quantity = match[3] ? Number(match[3]) : 1;

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      continue;
    }

    for (let index = 0; index < Math.max(1, quantity); index += 1) {
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

function getUserTranscript(messages) {
  return messages
    .filter((message) => message?.role === "user")
    .map((message) => String(message?.content || ""))
    .join("\n");
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

  for (const message of messages) {
    const content = String(message?.content || "");

    if (/montajlı|montajli|montaj dahil/i.test(content)) {
      serviceType = "montajli";
    }

    if (/montajsız|montajsiz|demonte|kargolu|şehir dışı|sehir disi/i.test(content)) {
      serviceType = "demonte";
    }
  }

  if (serviceType) return serviceType;

  const transcript = getTranscript(messages);
  if (/gaziantep/i.test(transcript)) return "montajli";

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

  // Fiyat talebi önceki mesajda verilmiş ve müşteri "tamam olur" gibi kısa bir
  // devam cevabı vermiş olsa bile fiyatı AI'ya bırakma; kesin motor hesaplasın.
  const shouldCalculate =
    isPriceRequest(latestText) ||
    (hasPriceContext(messages) && isShortFollowUp(latestText));

  if (!shouldCalculate) return null;

  // Ölçüler yalnızca son mesajda olmayabilir. Müşterinin önceki ölçülerini de kullan.
  const measurements = extractMeasurements(getUserTranscript(messages));
  if (measurements.length === 0) return null;

  const series = detectLatestSeries(messages);
  const serviceType = detectServiceType(messages);

  if (!series || !serviceType) return null;

  const unitPrice = PRICE_LIST[serviceType]?.[series];
  if (!unitPrice) return null;

  const totalSquareMeters = measurements.reduce((sum, measurement) => {
    const pieceSquareMeters = calculatePieceSquareMeters(
      measurement.width,
      measurement.height
    );
    return sum + pieceSquareMeters;
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
