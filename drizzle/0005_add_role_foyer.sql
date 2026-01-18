-- Migration pour ajouter le champ role_foyer à la table contacts
ALTER TABLE contacts ADD COLUMN role_foyer TEXT;
