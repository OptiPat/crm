/**
 * Active l'onglet « Aperçu client » (clé settings.espace_client_active).
 * Fermer le CRM avant d'exécuter : node scripts/enable-espace-client.cjs
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = path.join(
  process.env.APPDATA,
  "com.patrimoine-crm.app",
  "patrimoine-crm.db"
);

if (!fs.existsSync(dbPath)) {
  console.error("Base introuvable :", dbPath);
  console.error("Lancez le CRM au moins une fois, puis fermez-le.");
  process.exit(1);
}

const db = new Database(dbPath);
try {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('espace_client_active', '1', unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = unixepoch()`
  ).run();
  const row = db
    .prepare(`SELECT value FROM settings WHERE key = 'espace_client_active'`)
    .get();
  console.log("Activé :", row);
} catch (err) {
  console.error(
    "Erreur (CRM encore ouvert ?) :",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
} finally {
  db.close();
}
