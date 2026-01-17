-- Migration: Ajouter le champ "origine" aux investissements
-- Pour distinguer "MON_CONSEIL" (placé par le CGP) vs "EXISTANT_CLIENT" (patrimoine existant)

ALTER TABLE investissements ADD COLUMN origine TEXT NOT NULL DEFAULT 'MON_CONSEIL';
