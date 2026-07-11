const fs = require("fs");
const Module = require("module");
const path = require("path");

const prompt = require("./sales-prompt");
const filename = path.join(__dirname, "server.js");
let source = fs.readFileSync(filename, "utf8");

const extraSalesRules = `

EK SATIŞ KURALLARI:
- Instagram üzerinden sipariş alınmaz ve sipariş oluşturulmaz.
- Müşteri sipariş vermek, ürünü almak veya siparişi onaylamak isterse başka soru sormadan WhatsApp hattına yönlendir.
- Sipariş işlemleri yalnızca WhatsApp üzerinden tamamlanır.
- Sipariş yönlendirmesi: "Sipariş işlemlerimizi Instagram üzerinden almıyoruz 😊 Siparişinizi WhatsApp hattımızdan hemen oluşturabilirsiniz: 0530 028 89 03"
- Montajlı hizmette toplam ürün adedi 5 adedin altındaysa şu bilgiyi mutlaka ver: "5 adet altı montajlı işlemlerde mesafeye göre ekstra yol ücreti çıkabilir."
- Ekstra yol ücretinin tutarını söyleme veya tahmin etme. Tutar mesafeye göre WhatsApp'ta netleştirilir.
- 5 adet ve üzeri montajlı işlerde yol ücreti uyarısını yazma.
`;

const runtimePrompt = `${prompt}${extraSalesRules}`;

source = source.replace(
  /const BUSINESS_CONTEXT = `[\s\S]*?`;\n/,
  `const BUSINESS_CONTEXT = ${JSON.stringify(runtimePrompt)};\n`
);

source = source.replace(
  /const OPENAI_MODEL = process\.env\.OPENAI_MODEL \|\| "gpt-4\.1-mini";\n/,
  `const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";\nconst { buildDeterministicPriceReply } = require("./price-engine");\n`
);

source = source.replace(
  /appendConversationMessage\(senderId, "user", customerMessage\);\n  const conversation = getConversation\(senderId\);\n/,
  `appendConversationMessage(senderId, "user", customerMessage);\n  const conversation = getConversation(senderId);\n\n  const deterministicPriceReply = buildDeterministicPriceReply(conversation.messages);\n  if (deterministicPriceReply) {\n    appendConversationMessage(senderId, "assistant", deterministicPriceReply);\n    return deterministicPriceReply;\n  }\n`
);

const runtimeModule = new Module(filename, module);
runtimeModule.filename = filename;
runtimeModule.paths = module.paths;
runtimeModule._compile(source, filename);
