PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`foyer_id` integer,
	`categorie` text DEFAULT 'SUSPECT_CLIENT' NOT NULL,
	`civilite` text,
	`nom` text NOT NULL,
	`prenom` text NOT NULL,
	`email` text,
	`telephone` text,
	`adresse` text,
	`code_postal` text,
	`ville` text,
	`date_naissance` integer,
	`profession` text,
	`situation_familiale` text,
	`source_lead` text,
	`profil_risque_sri` integer,
	`date_dernier_contact` integer,
	`date_prochain_suivi` integer,
	`statut_suivi` text DEFAULT 'ACTIF' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`foyer_id`) REFERENCES `foyers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_contacts`("id", "foyer_id", "categorie", "civilite", "nom", "prenom", "email", "telephone", "adresse", "code_postal", "ville", "date_naissance", "profession", "situation_familiale", "source_lead", "profil_risque_sri", "date_dernier_contact", "date_prochain_suivi", "statut_suivi", "notes", "created_at", "updated_at") SELECT "id", "foyer_id", "categorie", "civilite", "nom", "prenom", "email", "telephone", "adresse", "code_postal", "ville", "date_naissance", "profession", "situation_familiale", "source_lead", "profil_risque_sri", "date_dernier_contact", "date_prochain_suivi", "statut_suivi", "notes", "created_at", "updated_at" FROM `contacts`;--> statement-breakpoint
DROP TABLE `contacts`;--> statement-breakpoint
ALTER TABLE `__new_contacts` RENAME TO `contacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;