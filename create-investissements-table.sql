-- Création de la table investissements
CREATE TABLE IF NOT EXISTS investissements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    foyer_id INTEGER,
    type_produit TEXT NOT NULL,
    partenaire_id INTEGER,
    nom_produit TEXT NOT NULL,
    montant_initial INTEGER,
    date_souscription INTEGER,
    date_fin_demembrement INTEGER,
    versement_programme INTEGER NOT NULL DEFAULT 0,
    montant_versement_programme INTEGER,
    frequence_versement TEXT,
    reinvestissement_dividendes INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (foyer_id) REFERENCES foyers(id) ON DELETE SET NULL,
    FOREIGN KEY (partenaire_id) REFERENCES partenaires(id) ON DELETE SET NULL
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_investissements_contact_id ON investissements(contact_id);
CREATE INDEX IF NOT EXISTS idx_investissements_foyer_id ON investissements(foyer_id);
CREATE INDEX IF NOT EXISTS idx_investissements_type_produit ON investissements(type_produit);
