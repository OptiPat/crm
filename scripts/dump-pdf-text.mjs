import fs from "node:fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

async function dump(path) {
  const data = new Uint8Array(fs.readFileSync(path));
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    text += tc.items.map((i) => i.str).join(" ") + "\n";
  }
  console.log("=== " + path + " ===");
  console.log(text);
  console.log("--- len", text.length);
}

for (const path of process.argv.slice(2)) {
  await dump(path);
}
