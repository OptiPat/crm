-- Ajout des nouvelles catégories et du champ parrain_id à la table contacts existante
-- Cette migration est SÛRE et ne supprime AUCUNE donnée

PRAGMA foreign_keys = OFF;

-- Étape 1 : Créer une nouvelle table avec les colonnes supplémentaires
CREATE TABLE contacts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  foyer_id INTEGER,
  categorie TEXT NOT NULL CHECK(categorie IN (
    'CLIENT',
    'PROSPECT_CLIENT',
    'PROSPECT_FILLEUL',
    'SUSPECT_CLIENT',
    'SUSPECT_FILLEUL',
    'FILLEUL',
    'FILLEUL_DESINSCRIT'
  )) DEFAULT 'SUSPECT_CLIENT',
  parrain_id INTEGER,
  civilite TEXT CHECK(civilite IN ('M', 'MME', 'AUTRE')),
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  adresse TEXT,
  code_postal TEXT,
  ville TEXT,
  date_naissance INTEGER,
  profession TEXT,
  situation_familiale TEXT CHECK(situation_familiale IN (
    'CELIBATAIRE',
    'MARIE',
    'PACSE',
    'DIVORCE',
    'VEUF',
    'AUTRE'
  )),
  source_lead TEXT,
  profil_risque_sri INTEGER,
  date_dernier_contact INTEGER,
  date_prochain_suivi INTEGER,
  statut_suivi TEXT NOT NULL CHECK(statut_suivi IN (
    'ACTIF',
    'EN_PAUSE',
    'ARCHIVE'
  )) DEFAULT 'ACTIF',
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (foyer_id) REFERENCES foyers(id) ON DELETE SET NULL,
  FOREIGN KEY (parrain_id) REFERENCES contacts_new(id) ON DELETE SET NULL
);

-- Étape 2 : Copier TOUTES les données existantes (parrain_id sera NULL pour les données existantes)
INSERT INTO contacts_new (
  id, foyer_id, categorie, civilite, nom, prenom, email, telephone,
  adresse, code_postal, ville, date_naissance, profession, situation_familiale,
  source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
  statut_suivi, notes, created_at, updated_at
)
SELECT 
  id, foyer_id, categorie, civilite, nom, prenom, email, telephone,
  adresse, code_postal, ville, date_naissance, profession, situation_familiale,
  source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
  statut_suivi, notes, created_at, updated_at
FROM contacts;

-- Étape 3 : Supprimer l'ancienne table
DROP TABLE contacts;

-- Étape 4 : Renommer la nouvelle table
ALTER TABLE contacts_new RENAME TO contacts;

-- Étape 5 : Recréer les index
CREATE INDEX IF NOT EXISTS idx_contacts_foyer_id ON contacts(foyer_id);
CREATE INDEX IF NOT EXISTS idx_contacts_parrain_id ON contacts(parrain_id);
CREATE INDEX IF NOT EXISTS idx_contacts_categorie ON contacts(categorie);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

PRAGMA foreign_keys = ON;
