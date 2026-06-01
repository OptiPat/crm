-- Segments réutilisables, liens alertes, journal AUTO, segment_id sur étiquettes
-- (Runtime : migrations Rust `migrate_segments_and_rule_engine` — ce fichier documente le schéma.)

CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  nom TEXT NOT NULL,
  description TEXT,
  rule_json TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS alerte_segment_links (
  type_alerte TEXT PRIMARY KEY,
  segment_id INTEGER NOT NULL,
  FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_etiquette_auto_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  contact_id INTEGER NOT NULL,
  etiquette_id INTEGER NOT NULL,
  matched INTEGER NOT NULL,
  reason TEXT,
  evaluated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (etiquette_id) REFERENCES etiquettes(id) ON DELETE CASCADE
);

-- Colonne ajoutée par migration Rust si absente :
-- ALTER TABLE etiquettes ADD COLUMN segment_id INTEGER REFERENCES segments(id) ON DELETE SET NULL;
