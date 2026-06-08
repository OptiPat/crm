import Database from "better-sqlite3";
import path from "path";
import os from "os";

const dbPath = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "com.patrimoine-crm.app",
  "patrimoine-crm.db"
);

const db = new Database(dbPath, { readonly: true });
const now = Math.floor(Date.now() / 1000);

const etiqu = db
  .prepare(
    `SELECT id, nom, email_actif, email_template_id, email_delai_jours,
            email_envoi_prevu, email_envoi_heure, email_envoi_jours_semaine
     FROM etiquettes
     WHERE LOWER(TRIM(nom)) = LOWER(TRIM('Suivi > 1 an'))`
  )
  .get();

if (!etiqu) {
  console.error("Etiquette Suivi > 1 an introuvable");
  process.exit(1);
}

console.log("=== Etiquette ===");
console.log(etiqu);

const tagged = db
  .prepare(
    `SELECT COUNT(DISTINCT ce.contact_id) AS n
     FROM contact_etiquettes ce WHERE ce.etiquette_id = ?`
  )
  .get(etiqu.id);
console.log("\n=== Contacts étiquetés ===", tagged.n);

const byReg = db
  .prepare(
    `SELECT UPPER(COALESCE(c.registre, 'VOUS')) AS registre, COUNT(DISTINCT c.id) AS n
     FROM contact_etiquettes ce
     JOIN contacts c ON c.id = ce.contact_id
     WHERE ce.etiquette_id = ?
     GROUP BY registre`
  )
  .all(etiqu.id);
console.log("Par registre (étiquette):", byReg);

const buckets = db
  .prepare(
    `SELECT
       CASE
         WHEN COALESCE(ce.email_annule, 0) = 1 THEN 'annule'
         WHEN ce.email_envoye = 1 AND ce.email_reponse_at IS NULL THEN 'envoye_attente'
         WHEN ce.email_envoye = 1 THEN 'envoye_repondu'
         WHEN c.email IS NULL OR TRIM(c.email) = '' THEN 'sans_email'
         WHEN e.email_template_id IS NULL THEN 'sans_template'
         WHEN ce.email_date_prevue IS NULL THEN 'sans_date'
         WHEN ce.email_date_prevue > ? THEN 'planifie'
         ELSE 'pret'
       END AS bucket,
       UPPER(COALESCE(c.registre, 'VOUS')) AS registre,
       COUNT(*) AS n
     FROM contact_etiquettes ce
     JOIN contacts c ON c.id = ce.contact_id
     JOIN etiquettes e ON e.id = ce.etiquette_id
     WHERE ce.etiquette_id = ?
     GROUP BY bucket, registre
     ORDER BY bucket, registre`
  )
  .all(now, etiqu.id);
console.log("\n=== Répartition file (logique app) ===");
for (const row of buckets) {
  console.log(`  ${row.bucket} / ${row.registre}: ${row.n}`);
}

const notReady = db
  .prepare(
    `SELECT c.prenom, c.nom,
            UPPER(COALESCE(c.registre, 'VOUS')) AS registre,
            ce.email_envoye, ce.email_date_prevue, ce.email_date_envoi,
            COALESCE(ce.email_annule, 0) AS email_annule,
            c.email, c.statut_suivi
     FROM contact_etiquettes ce
     JOIN contacts c ON c.id = ce.contact_id
     JOIN etiquettes e ON e.id = ce.etiquette_id
     WHERE ce.etiquette_id = ?
       AND NOT (
         e.email_actif = 1
         AND ce.email_envoye = 0
         AND COALESCE(ce.email_annule, 0) = 0
         AND ce.email_date_prevue IS NOT NULL
         AND ce.email_date_prevue <= ?
         AND e.email_template_id IS NOT NULL
         AND c.email IS NOT NULL
         AND TRIM(c.email) != ''
       )
     ORDER BY registre, c.nom, c.prenom`
  )
  .all(etiqu.id, now);

console.log(`\n=== Hors « Prêts à envoyer » (${notReady.length}) ===`);
for (const m of notReady) {
  const prevue = m.email_date_prevue
    ? new Date(m.email_date_prevue * 1000).toLocaleString("fr-FR")
    : "NULL";
  const envoi = m.email_date_envoi
    ? new Date(m.email_date_envoi * 1000).toLocaleString("fr-FR")
    : "NULL";
  console.log(
    `  ${m.registre} | ${m.prenom} ${m.nom} | envoye=${m.email_envoye} annule=${m.email_annule} | prevue=${prevue} | envoi=${envoi} | suivi=${m.statut_suivi}`
  );
}

const alertes = db
  .prepare(
    `SELECT COUNT(*) AS n FROM alertes a
     JOIN contacts c ON c.id = a.contact_id
     WHERE a.traitee = 0 AND a.type_alerte = 'SUIVI_CLIENT_1AN'
       AND c.statut_suivi NOT IN ('EN_PAUSE', 'ARCHIVE')
       AND COALESCE(c.filleul_categorie, '') != 'FILLEUL_DESINSCRIT'`
  )
  .get();
console.log("\n=== Alertes SUIVI_CLIENT_1AN ouvertes ===", alertes.n);

const alertNoTag = db
  .prepare(
    `SELECT c.prenom, c.nom, UPPER(COALESCE(c.registre, 'VOUS')) AS registre
     FROM alertes a
     JOIN contacts c ON c.id = a.contact_id
     LEFT JOIN contact_etiquettes ce ON ce.contact_id = c.id AND ce.etiquette_id = ?
     WHERE a.traitee = 0 AND a.type_alerte = 'SUIVI_CLIENT_1AN' AND ce.id IS NULL
     ORDER BY c.nom`
  )
  .all(etiqu.id);
console.log(`\n=== Alertes SANS étiquette Suivi > 1 an (${alertNoTag.length}) ===`);
for (const a of alertNoTag) {
  console.log(`  ${a.registre} | ${a.prenom} ${a.nom}`);
}

const exclusions = db
  .prepare(
    `SELECT c.prenom, c.nom, UPPER(COALESCE(c.registre, 'VOUS')) AS registre
     FROM contact_etiquette_auto_exclusions ex
     JOIN contacts c ON c.id = ex.contact_id
     WHERE ex.etiquette_id = ?
     ORDER BY c.nom`
  )
  .all(etiqu.id);
console.log(`\n=== Exclusions calcul auto (${exclusions.length}) ===`);
for (const e of exclusions) {
  console.log(`  ${e.registre} | ${e.prenom} ${e.nom}`);
}

db.close();
