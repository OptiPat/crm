import fs from "node:fs";
import { PDFDocument } from "pdf-lib";

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Usage: node scripts/inspect-pdf-fields.mjs <path-to-pdf>");
  process.exit(1);
}

const bytes = fs.readFileSync(pdfPath);
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = doc.getForm();

for (const field of form.getFields()) {
  console.log(`${field.getName()} | ${field.constructor.name}`);
}
