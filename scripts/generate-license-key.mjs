#!/usr/bin/env node
/**
 * Génère une clé de licence CRM (hors dépôt — secret en variable d'environnement).
 *
 * Usage:
 *   LICENSE_SIGNING_SECRET=xxx node scripts/generate-license-key.mjs annual 2706
 *   LICENSE_SIGNING_SECRET=xxx node scripts/generate-license-key.mjs lifetime
 */

import crypto from "node:crypto";

const secret = process.env.LICENSE_SIGNING_SECRET;
if (!secret) {
  console.error("Définissez LICENSE_SIGNING_SECRET (hors repo).");
  process.exit(1);
}

const [typeArg, yymmArg] = process.argv.slice(2);
if (!typeArg) {
  console.error("Usage: node scripts/generate-license-key.mjs <annual|lifetime> [YYMM]");
  process.exit(1);
}

const typeCode = typeArg.toLowerCase().startsWith("life") ? "LIFE" : "ANNU";
const expiryPart =
  typeCode === "ANNU"
    ? (() => {
        if (!yymmArg || !/^\d{4}$/.test(yymmArg)) {
          console.error("Pour annual, fournissez YYMM (ex. 2706 pour juin 2027).");
          process.exit(1);
        }
        return yymmArg;
      })()
    : "0000";

const randomPart = randomSegment();
const payload = `${typeCode}-${expiryPart}-${randomPart}`;
const signature = computeSignature(secret, payload);
const key = `${payload}-${signature}`;

console.log(key);

function randomSegment() {
  const chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

function computeSignature(secretValue, payload) {
  return crypto
    .createHmac("sha256", secretValue)
    .update(payload)
    .digest()
    .subarray(0, 2)
    .toString("hex")
    .toUpperCase();
}
