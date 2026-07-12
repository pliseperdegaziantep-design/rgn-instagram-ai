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

const TURKISH_CITIES = [
  "adana","adıyaman","afyonkarahisar","ağrı","amasya","ankara","antalya","artvin","aydın","balıkesir","bilecik","bingöl","bitlis","bolu","burdur","bursa","çanakkale","çankırı","çorum","denizli","diyarbakır","edirne","elazığ","erzincan","erzurum","eskişehir","gaziantep","giresun","gümüşhane","hakkari","hatay","ısparta","mersin","istanbul","izmir","kars","kastamonu","kayseri","kırklareli","kırşehir","kocaeli","konya","kütahya","malatya","manisa","kahramanmaraş","mardin","muğla","muş","nevşehir","niğde","ordu","rize","sakarya","samsun","siirt","sinop","sivas","tekirdağ","tokat","trabzon","tunceli","şanlıurfa","uşak","van","yozgat","zonguldak","aksaray","bayburt","karaman","kırıkkale","batman","şırnak","bartın","ardahan","ığdır","yalova","karabük","kilis","osmaniye","düzce"
];

function normalizeText(value) {
  return String(value || "").toLocaleLowerCase("tr-TR");
}

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
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(quantity) || width <= 0 || height <= 0 || quantity <= 0) return;
  for (let i = 0; i < quantity; i += 1) measurements.push({ width, height });
}

function extractMeasurements(text) {
  const source = String(text || "");
  const measurements = [];
  let match;

  const xPattern = /(?:(\d+)\s*(?:adet|tane|cam)\s*(?:var\s*)?)?(\d+(?:[.,]\d+)?)\s*(?:cm\s*)?[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*cm)?(?:\s*[-–:]?\s*(\d+)\s*(?:adet|tane|cam))?/gi;
  while ((match = xPattern.exec(source)) !== null) {
    pushMeasurementCopies(measurements, normalizeNumber(match[2]), normalizeNumber(match[3]), Number(match[1] || match[4] || 1));
  }

  const enBoyPattern = /(?:(\d+)\s*(?:adet|tane|cam)\s*)?(\d+(?:[.,]\d+)?)\s*(?:cm\s*)?(?:en|genişlik)\.?\s*[,;:\-]?\s*(\d+(?:[.,]\d+)?)\s*(?:cm\s*)?(?:boy|uzunluk)\.?/gi;
  while ((match = enBoyPattern.exec(source)) !== null) {
    pushMeasurementCopies(measurements, normalizeNumber(match[2]), normalizeNumber(match[3]), Number(match[1] || 1));
  }

  const boyEnPattern = /(?:(\d+)\s*(?:adet|tane|cam)\s*)?(?:boy|uzunluk)\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*(?:en|genişlik)\s*(\d+(?:[.,]\d+)?)/gi;
  while ((match = boyEnPattern.exec(source)) !== null) {
    pushMeasurementCopies(measurements, normalizeNumber(match[3]), normalizeNumber(match[2]), Number(match[1] || 1));
  }

  return measurements;
}

function getUserMessages(messages) {
  return messages.filter((message) => message?.role === "user");
}

function getUserTranscript(messages) {
  return getUserMessages(messages).map((message) => String(message?.content || "")).join("\n");
}

function detectLatest(messages, detectors) {
  let value = null;
  for (const message of getUserMessages(messages)) {
    const content = String(message?.content || "");
    for (const [result, pattern] of detectors) if (pattern.test(content)) value = result;
  }
  return value;
}

function detectSeries(messages) {
  return detectLatest(messages, SERIES_PATTERNS);
}

function detectApplicationArea(messages) {
  return detectLatest(messages, [
    ["Cam Balkon", /cam\s*balkon/i],
    ["PVC Pencere", /pvc|pimapen|pencere/i],
    ["Balkon Kapısı", /balkon\s*kapı/i],
    ["Ofis", /ofis|iş\s*yeri/i],
    ["Kış Bahçesi", /kış\s*bahçe/i],
    ["Diğer", /diğer/i],
  ]);
}

function detectCity(messages) {
  let city = null;
  for (const message of getUserMessages(messages)) {
    const text = normalizeText(message?.content);
    for (const candidate of TURKISH_CITIES) if (text.includes(candidate)) city = candidate;
    if (/şehir\s*dışı|başka\s*şehir/i.test(text)) city = "şehir dışı";
  }
  return city;
}

function detectServiceType(messages) {
  return detectLatest(messages, [
    ["montajli", /montajlı|montajli|montaj dahil/i],
    ["demonte", /montajsız|montajsiz|demonte|kargolu/i],
  ]);
}

function detectMountingSystem(messages) {
  return detectLatest(messages, [
    ["Kancalı", /kancalı|kancali|delmesiz/i],
    ["Vidalı", /vidalı|vidali/i],
  ]);
}

function detectProfileColor(messages) {
  return detectLatest(messages, [
    ["Beyaz", /\bbeyaz\b/i],
    ["Antrasit", /antrasit/i],
    ["Siyah", /\bsiyah\b/i],
  ]);
}

function detectCaseType(messages) {
  return detectLatest(messages, [
    ["Slim Kasa", /slim\s*kasa|ısıcam|isicam/i],
    ["Normal Kasa", /normal\s*kasa/i],
  ]);
}

function isPriceRequest(text) {
  return /fiyat|tutar|kaç tl|kac tl|ne kadar|hesap|ücret|ucret|maliyet/i.test(String(text || ""));
}

function findLatestMeasurementText(messages) {
  const userMessages = getUserMessages(messages);
  for (let i = userMessages.length - 1; i >= 0; i -= 1) {
    const content = String(userMessages[i]?.content || "").trim();
    if (extractMeasurements(content).length > 0) return content;
  }
  return "";
}

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
}

function missingInfoReply(state) {
  const missing = [];
  if (!state.applicationArea) missing.push("uygulama alanını");
  if (!state.city) missing.push("şehri");
  if (!state.serviceType) missing.push("hizmet tipini (demonte/kargolu veya montajlı)");
  if (!state.mountingSystem) missing.push("montaj sistemini (kancalı veya vidalı)");
  if (!state.series) missing.push("kumaş serisini");
  if (!state.profileColor) missing.push("profil rengini");
  if (!state.caseType) missing.push("kasa tipini (normal veya slim)");
  if (!state.measurements.length) missing.push("ölçüleri En × Boy cm şeklinde");
  if (!missing.length) return null;
  return `Tabii 😊 Fiyatı kod üzerinden doğru hazırlayabilmem için ${missing.slice(0, 2).join(" ve ")} paylaşabilir misiniz?`;
}

function buildDeterministicPriceReply(messages) {
  const latestUserMessage = [...messages].reverse().find((message) => message?.role === "user");
  const latestText = String(latestUserMessage?.content || "").trim();
  if (!latestText) return null;

  const priceContext = getUserMessages(messages).some((message) => isPriceRequest(message?.content));
  if (!priceContext) return null;

  const measurementText = findLatestMeasurementText(messages);
  const state = {
    applicationArea: detectApplicationArea(messages),
    city: detectCity(messages),
    serviceType: detectServiceType(messages),
    mountingSystem: detectMountingSystem(messages),
    series: detectSeries(messages),
    profileColor: detectProfileColor(messages),
    caseType: detectCaseType(messages),
    measurements: extractMeasurements(measurementText),
  };

  if (state.city && state.city !== "gaziantep" && state.serviceType === "montajli") {
    return "Montajlı hizmetimiz yalnızca Gaziantep içinde veriliyor 😊 Şehir dışı için demonte/kargolu fiyat hazırlayabiliriz.";
  }

  const missingReply = missingInfoReply(state);
  if (missingReply) return missingReply;

  const unitPrice = PRICE_LIST[state.serviceType]?.[state.series];
  if (!unitPrice) return "Fiyat hesaplamasını şu an tamamlayamadım 😊 Seçim bilgilerinden birini tekrar kontrol edebilir miyiz?";

  const itemSquareMeters = state.measurements.map((measurement) => calculatePieceSquareMeters(measurement.width, measurement.height));
  const totalSquareMeters = itemSquareMeters.reduce((sum, value) => sum + value, 0);
  const subtotal = totalSquareMeters * unitPrice;
  const slimFee = state.caseType === "Slim Kasa" ? totalSquareMeters * 60 : 0;
  const codFee = state.measurements.length === 1 ? 100 : 0;
  const generalTotal = subtotal + slimFee + codFee;
  const shippingStatus = generalTotal >= 3000 ? "Ücretsiz" : "Alıcıya ait";

  return `📐 Toplam Ölçü\nToplam m²: ${formatNumber(totalSquareMeters)}\n\n🪟 Seçilen Seri\n${state.series}\n\n💰 Birim Fiyat\n${formatMoney(unitPrice)} TL / m²\n\nAra Toplam\n${formatMoney(subtotal)} TL\n\nSlim Kasa\n${slimFee > 0 ? `${formatMoney(slimFee)} TL` : "Yok"}\n\nKapıda Ödeme\n${codFee > 0 ? `${formatMoney(codFee)} TL hizmet bedeli` : "Ek hizmet bedeli yok"}\n\nKargo\n${shippingStatus}\n\n━━━━━━━━━━━━━━\n\n💵 Genel Toplam\n${formatMoney(generalTotal)} TL\n\nÜretim tamamen size özel yapılmaktadır 😊\n\n✅ Özel Ölçü Üretim\n✅ 2 Yıl Garanti\n✅ 81 İle Kargo\n✅ Kapıda Ödeme\n✅ Ortalama 7 İş Gününde Üretim\n\nSipariş işleminizi WhatsApp üzerinden hemen oluşturabilirsiniz 😊\n👉 WhatsApp Sipariş Hattı: 0530 028 89 03`;
}

module.exports = {
  PRICE_LIST,
  roundDimensionUpTo10,
  calculatePieceSquareMeters,
  extractMeasurements,
  buildDeterministicPriceReply,
};