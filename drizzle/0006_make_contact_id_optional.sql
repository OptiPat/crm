-- Migration : Rendre contact_id optionnel pour les investissements de foyer
-- SQLite ne supporte pas ALTER COLUMN, donc on doit recréer la table

-- Étape 1 : Créer une table temporaire
CREATE TABLE investissements_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE, -- Plus de NOT NULL
    foyer_id INTEGER REFERENCES foyers(id) ON DELETE SET NULL,
    type_produit TEXT NOT NULL,
    nom_produit TEXT NOT NULL,
    partenaire_id INTEGER REFERENCES partenaires(id) ON DELETE SET NULL,
    montant_initial INTEGER,
    date_souscription INTEGER,
    date_fin_demembrement INTEGER,
    versement_programme INTEGER DEFAULT 0,
    montant_versement_programme INTEGER,
    frequence_versement TEXT,
    reinvestissement_dividendes INTEGER DEFAULT 0,
    notes TEXT,
    origine TEXT DEFAULT 'NOUVEAU_RIO',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- Étape 2 : Copier les données
INSERT INTO investissements_new 
SELECT * FROM investissements;

-- Étape 3 : Supprimer l'ancienne table
DROP TABLE investissements;

-- Étape 4 : Renommer la nouvelle table
ALTER TABLE investissements_new RENAME TO investissements;
