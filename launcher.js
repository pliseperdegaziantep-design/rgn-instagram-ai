const fs = require("fs");
const Module = require("module");
const path = require("path");

const prompt = require("./sales-prompt");
const filename = path.join(__dirname, "server.js");
let source = fs.readFileSync(filename, "utf8");

source = source.replace(
  /const BUSINESS_CONTEXT = `[\s\S]*?`;\n/,
  `const BUSINESS_CONTEXT = ${JSON.stringify(prompt)};\n`
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
