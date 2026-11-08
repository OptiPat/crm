/**
 * Fusionne latest.json multi-plateformes à partir des assets d'une release GitHub.
 * Usage CI : RELEASE_TAG=v0.4.57 GITHUB_TOKEN=... node scripts/ci-merge-latest-json.mjs
 */
import fs from "node:fs";

const tag = process.env.RELEASE_TAG?.trim();
const token = process.env.GITHUB_TOKEN?.trim();
const repo = process.env.GITHUB_REPOSITORY ?? "OptiPat/crm";

if (!tag) {
  console.error("RELEASE_TAG manquant (ex. v0.4.57)");
  process.exit(1);
}

const version = tag.replace(/^v/, "");
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "crm-release-updater",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const releaseRes = await fetch(
  `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
  { headers }
);
if (!releaseRes.ok) {
  console.error(`Release ${tag} introuvable (${releaseRes.status})`);
  process.exit(1);
}

const release = await releaseRes.json();
const assets = release.assets ?? [];

function findAsset(pattern) {
  return assets.find((asset) => pattern.test(asset.name));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Signature `.sig` d'un asset. Endpoint API (`assets/{id}` en octet-stream) d'abord :
 * le lien public `releases/download/…` peut renvoyer 504 pendant des heures (v0.5.70).
 * Plusieurs essais, lien public en dernier recours.
 */
async function readSignature(sigAsset) {
  const sources = [
    { url: sigAsset.url, headers: { ...headers, Accept: "application/octet-stream" } },
    { url: sigAsset.browser_download_url, headers },
  ];
  let lastStatus = "réseau";
  for (let attempt = 1; attempt <= 4; attempt++) {
    for (const source of sources) {
      try {
        const res = await fetch(source.url, { headers: source.headers });
        if (res.ok) return (await res.text()).trim();
        lastStatus = res.status;
      } catch (error) {
        lastStatus = error instanceof Error ? error.message : String(error);
      }
    }
    if (attempt < 4) await sleep(attempt * 5_000);
  }
  throw new Error(`Impossible de lire ${sigAsset.name} (${lastStatus})`);
}

function addPlatform(platforms, key, url, signature) {
  platforms[key] = { url, signature };
}

const platforms = {};

const exe = findAsset(/_x64-setup\.exe$/i);
const exeSig = findAsset(/_x64-setup\.exe\.sig$/i);
if (exe && exeSig) {
  const signature = await readSignature(exeSig);
  addPlatform(platforms, "windows-x86_64", exe.browser_download_url, signature);
  addPlatform(platforms, "windows-x86_64-nsis", exe.browser_download_url, signature);
}

const tarGz = findAsset(/\.app\.tar\.gz$/i);
const tarGzSig = findAsset(/\.app\.tar\.gz\.sig$/i);
if (tarGz && tarGzSig) {
  const signature = await readSignature(tarGzSig);
  const url = tarGz.browser_download_url;
  // Build universal macOS : mêmes artefacts pour Intel et Apple Silicon.
  for (const key of [
    "darwin-aarch64",
    "darwin-aarch64-app",
    "darwin-x86_64",
    "darwin-x86_64-app",
  ]) {
    addPlatform(platforms, key, url, signature);
  }
}

const keys = Object.keys(platforms);
if (keys.length === 0) {
  console.error("Aucune plateforme updater détectée dans la release.");
  console.error(
    "Attendu : *_x64-setup.exe(.sig) et/ou *.app.tar.gz(.sig) — pas le .dmg seul."
  );
  process.exit(1);
}

const latest = {
  version,
  notes: typeof release.body === "string" ? release.body : "",
  pub_date: release.published_at ?? new Date().toISOString(),
  platforms,
};

const outPath = "latest.json";
fs.writeFileSync(outPath, `${JSON.stringify(latest, null, 2)}\n`, "utf8");
console.log(`latest.json écrit (${keys.length} clés) : ${keys.join(", ")}`);
