/**
 * Copie worker + assets pdf.js pour Tauri (WKWebView macOS, hors-ligne).
 * Le worker reçoit un polyfill Promise.withResolvers (absent sur plusieurs WebKit).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pdfjsRoot = path.join(root, "node_modules/pdfjs-dist");
const publicPdfjs = path.join(root, "public/pdfjs");

/** Polyfill minifié exécuté dans le worker avant pdf.js (WebKit macOS). */
const WORKER_PROMISE_WITH_RESOLVERS_POLYFILL = [
  "(function(){",
  'if(typeof Promise.withResolvers!="function"){',
  "Promise.withResolvers=function(){",
  "var r,e,t=new Promise(function(n,o){r=n;e=o});",
  "return{promise:t,resolve:r,reject:e};",
  "};",
  "}",
  "})();",
  "",
].join("");

if (!fs.existsSync(pdfjsRoot)) {
  console.error("copy-pdf-assets: pdfjs-dist introuvable — lancez npm install");
  process.exit(1);
}

fs.mkdirSync(publicPdfjs, { recursive: true });

const workerSrc = path.join(pdfjsRoot, "legacy/build/pdf.worker.min.mjs");
const workerDest = path.join(publicPdfjs, "pdf.worker.min.js");
const workerBody = fs.readFileSync(workerSrc, "utf8");
fs.writeFileSync(workerDest, WORKER_PROMISE_WITH_RESOLVERS_POLYFILL + workerBody);

for (const dir of ["standard_fonts", "cmaps", "wasm"]) {
  const from = path.join(pdfjsRoot, dir);
  const to = path.join(publicPdfjs, dir);
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

console.log("copy-pdf-assets: public/pdfjs/ (worker + fonts + cmaps + wasm)");
