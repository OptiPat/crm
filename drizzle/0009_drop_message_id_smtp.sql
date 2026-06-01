-- Colonne legacy (SMTP) — remplacée par email_gmail_message_id sur contact_etiquettes
ALTER TABLE `emails` DROP COLUMN `message_id_smtp`;
