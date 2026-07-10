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

const runtimeModule = new Module(filename, module);
runtimeModule.filename = filename;
runtimeModule.paths = module.paths;
runtimeModule._compile(source, filename);
