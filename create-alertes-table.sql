-- Script pour créer la table alertes manuellement
CREATE TABLE IF NOT EXISTS `alertes` (
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
