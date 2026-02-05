-- Migration : Ajouter le système d'étiquettes personnalisables
-- Ce système remplace/améliore les alertes existantes avec des étiquettes configurables par l'utilisateur

-- Table des étiquettes (définitions)
CREATE TABLE `etiquettes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nom` text NOT NULL,
	`couleur` text NOT NULL DEFAULT '#3B82F6',
	`icone` text,
	`description` text,
	`priorite` integer DEFAULT 0 NOT NULL,
	
	-- Attribution automatique (optionnel, NULL = manuel uniquement)
	-- Types possibles :
	-- 'DELAI_SANS_CONTACT' : X jours depuis date_dernier_contact
	-- 'DATE_APPROCHE' : X jours avant un champ date
	-- 'PERIODE_ANNEE' : Entre mois X et mois Y
	-- 'TYPE_PRODUIT' : Client a un investissement de ce type
	-- NULL : Attribution manuelle uniquement
	`auto_condition_type` text,
	`auto_condition_config` text,
	`auto_categories` text,
	
	-- Action email (optionnel)
	`email_template_id` integer REFERENCES `templates_email`(`id`) ON DELETE SET NULL,
	`email_delai_jours` integer DEFAULT 0 NOT NULL,
	`email_actif` integer DEFAULT 0 NOT NULL,
	
	-- Système
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
-- Table de liaison contact-étiquette
CREATE TABLE `contact_etiquettes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`etiquette_id` integer NOT NULL,
	`date_attribution` integer DEFAULT (unixepoch()) NOT NULL,
	`attribue_par` text DEFAULT 'AUTO' NOT NULL,
	
	-- Suivi email
	`email_envoye` integer DEFAULT 0 NOT NULL,
	`email_date_prevue` integer,
	`email_date_envoi` integer,
	
	`notes` text,
	
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`etiquette_id`) REFERENCES `etiquettes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
-- Index pour éviter les doublons contact+étiquette
CREATE UNIQUE INDEX `contact_etiquettes_unique` ON `contact_etiquettes` (`contact_id`, `etiquette_id`);
--> statement-breakpoint
-- Index pour les recherches par étiquette
CREATE INDEX `contact_etiquettes_etiquette_idx` ON `contact_etiquettes` (`etiquette_id`);
--> statement-breakpoint
-- Index pour les emails programmés
CREATE INDEX `contact_etiquettes_email_pending_idx` ON `contact_etiquettes` (`email_envoye`, `email_date_prevue`);
