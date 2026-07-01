-- Clôture investissement : sortie de l'encours sans perte des stats historiques
ALTER TABLE investissements ADD COLUMN statut TEXT NOT NULL DEFAULT 'ACTIF';
ALTER TABLE investissements ADD COLUMN date_cloture INTEGER;
