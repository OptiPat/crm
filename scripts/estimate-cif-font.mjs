import fs from "fs";

function extract(file: string, marker: string): string {
  const s = fs.readFileSync(file, "utf8");
  const start = s.indexOf(marker) + marker.length;
  const end = s.indexOf("`;", start);
  return s.slice(start, end);
}

const footer = extract(
  "src/lib/souscription-cif/scpi-lettre-mission-page1.ts",
  "SCPI_LM_PAGE1_FOOTER_DEFAULT = `"
);
const pages = [
  {
    name: "P1",
    body: extract(
      "src/lib/souscription-cif/scpi-lettre-mission-page1.ts",
      "SCPI_LM_PAGE1_BODY_AFTER_TITLE = `"
    ),
    extra: 6.5,
  },
  {
    name: "P2",
    body: extract("src/lib/souscription-cif/scpi-lettre-mission-page2.ts", "SCPI_LM_PAGE2_BODY = `"),
    extra: 0,
  },
  {
    name: "P3",
    body: extract("src/lib/souscription-cif/scpi-lettre-mission-page3.ts", "SCPI_LM_PAGE3_BODY = `"),
    extra: 0,
  },
];

const sample = (t: string) => t.replace(/\{\{[^}]+\}\}/g, "XXXXXXXXXX");

function wrapLines(text: string, charsPerLine: number): number {
  return text.split("\n").reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine)),
    0
  );
}

for (const bodyPt of [10, 11]) {
  const bodyCpl = bodyPt === 10 ? 86 : 78;
  const lineMm = bodyPt * 1.15 * 0.3528;
  const footLines = wrapLines(sample(footer), 95);
  const footH = footLines * (7 * 1.25 * 0.3528) + 12;
  const maxLines = Math.floor((297 - 28 - footH) / lineMm);
  console.log(`\n=== ${bodyPt} pt (max ${maxLines} lignes corps) ===`);
  for (const { name, body, extra } of pages) {
    const need = wrapLines(sample(body), bodyCpl) + extra;
    const overflow = Math.max(0, need - maxLines);
    console.log(`${name}: ${need} lignes → ${overflow > 0 ? `DÉBORDE (+${overflow.toFixed(1)})` : "OK"}`);
  }
}

// P2 avec objectifs longs (500 caractères)
const p2 = pages[1].body.replace(
  "{{objectifs_client}}",
  "X".repeat(500)
);
const bodyPt = 10;
const bodyCpl = 86;
const lineMm = bodyPt * 1.15 * 0.3528;
const footLines = wrapLines(sample(footer), 95);
const footH = footLines * (7 * 1.25 * 0.3528) + 12;
const maxLines = Math.floor((297 - 28 - footH) / lineMm);
const needLong = wrapLines(sample(p2), bodyCpl);
console.log(`\n=== P2 objectifs 500 car @ 10pt: ${needLong} lignes (max ${maxLines}) ===`);
