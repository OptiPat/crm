CREATE TABLE `alertes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`type_alerte` text NOT NULL,
	`message` text NOT NULL,
	`date_alerte` integer NOT NULL,
	`lue` integer DEFAULT 0 NOT NULL,
	`traitee` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`foyer_id` integer,
	`categorie` text NOT NULL,
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
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`foyer_id` integer,
	`type_document` text NOT NULL,
	`nom_fichier` text NOT NULL,
	`chemin_fichier` text NOT NULL,
	`date_document` integer,
	`hash_fichier` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`foyer_id`) REFERENCES `foyers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`interaction_id` integer,
	`message_id_smtp` text,
	`sujet` text NOT NULL,
	`corps` text NOT NULL,
	`de` text NOT NULL,
	`a` text NOT NULL,
	`date_envoi` integer,
	`statut` text DEFAULT 'BROUILLON' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `foyers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nom` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`type_interaction` text NOT NULL,
	`sujet` text,
	`contenu` text,
	`date_interaction` integer NOT NULL,
	`email_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `investissements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`foyer_id` integer,
	`type_produit` text NOT NULL,
	`partenaire_id` integer,
	`nom_produit` text NOT NULL,
	`montant_initial` integer,
	`date_souscription` integer,
	`date_fin_demembrement` integer,
	`versement_programme` integer DEFAULT 0 NOT NULL,
	`montant_versement_programme` integer,
	`frequence_versement` text,
	`reinvestissement_dividendes` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`foyer_id`) REFERENCES `foyers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`partenaire_id`) REFERENCES `partenaires`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `parametres` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cle` text NOT NULL,
	`valeur` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parametres_cle_unique` ON `parametres` (`cle`);--> statement-breakpoint
CREATE TABLE `partenaires` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nom` text NOT NULL,
	`type_produit` text,
	`contact_commercial` text,
	`email` text,
	`telephone` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `templates_email` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nom` text NOT NULL,
	`sujet` text NOT NULL,
	`corps` text NOT NULL,
	`categorie` text NOT NULL,
	`variables` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
