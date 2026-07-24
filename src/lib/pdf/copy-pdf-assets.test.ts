import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workerPath = path.join(process.cwd(), "public/pdfjs/pdf.worker.min.js");

describe("copy-pdf-assets output", () => {
  it("worker public avec polyfill Promise.withResolvers en tête", () => {
    expect(fs.existsSync(workerPath)).toBe(true);
    const head = fs.readFileSync(workerPath, "utf8").slice(0, 200);
    expect(head).toContain("Promise.withResolvers");
    expect(head.startsWith("(function(){")).toBe(true);
  });

  it("worker classic sans export ESM (compat WKWebView / importScripts)", () => {
    const body = fs.readFileSync(workerPath, "utf8");
    expect(body).toContain("globalThis.pdfjsWorker");
    expect(body).not.toMatch(/\bexport\s*\{/);
    expect(body).not.toMatch(/\bexport\s+default\b/);
  });
});
