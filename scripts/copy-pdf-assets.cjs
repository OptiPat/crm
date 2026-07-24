/**
 * Copie worker + assets pdf.js pour Tauri (WKWebView macOS, hors-ligne).
 *
 * Le worker legacy est un module ESM (`export{...}`). WKWebView macOS charge
 * souvent le worker en script classique (importScripts / fake-worker) → SyntaxError
 * sur `export`, le polyfill ne s'exécute jamais, puis :
 *   undefined is not a function (near '...e,t...')
 *
 * On préfixe Promise.withResolvers et on retire le `export` final pour un
 * worker à effets de bord uniquement (`globalThis.pdfjsWorker`).
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
  "var resolve,reject,promise=new Promise(function(res,rej){resolve=res;reject=rej});",
  "return{promise:promise,resolve:resolve,reject:reject};",
  "};",
  "}",
  "})();",
  "",
].join("");

/** Retire les `export …` pour compatibilité Worker classique / fake-worker. */
function toClassicWorkerBody(esmBody) {
  return esmBody
    .replace(/\bexport\s*\{[^}]*\}\s*;?/g, "")
    .replace(/\bexport\s+default\s+[^;]+;/g, "")
    .trimEnd();
}

if (!fs.existsSync(pdfjsRoot)) {
  console.error("copy-pdf-assets: pdfjs-dist introuvable — lancez npm install");
  process.exit(1);
}

fs.mkdirSync(publicPdfjs, { recursive: true });

const workerSrc = path.join(pdfjsRoot, "legacy/build/pdf.worker.min.mjs");
const workerDest = path.join(publicPdfjs, "pdf.worker.min.js");
const workerBody = toClassicWorkerBody(fs.readFileSync(workerSrc, "utf8"));

if (!workerBody.includes("globalThis.pdfjsWorker")) {
  console.error(
    "copy-pdf-assets: worker sans globalThis.pdfjsWorker — build pdfjs inattendu"
  );
  process.exit(1);
}
if (/\bexport\s*\{/.test(workerBody)) {
  console.error("copy-pdf-assets: export ESM restant dans le worker");
  process.exit(1);
}

fs.writeFileSync(workerDest, WORKER_PROMISE_WITH_RESOLVERS_POLYFILL + workerBody + "\n");

for (const dir of ["standard_fonts", "cmaps", "wasm"]) {
  const from = path.join(pdfjsRoot, dir);
  const to = path.join(publicPdfjs, dir);
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

console.log("copy-pdf-assets: public/pdfjs/ (worker classic + fonts + cmaps + wasm)");
