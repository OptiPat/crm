// ⚠️ DEV / DOC uniquement (inspection Drizzle). Le runtime utilise Rust + rusqlite.
// Aucun code applicatif n'importe ce module ; ne pas l'utiliser en production.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// Chemin vers la base de données (sera dans le dossier AppData de l'utilisateur)
// Pour l'instant, on utilise un chemin relatif pour le développement
const sqlite = new Database("patrimoine-crm.db");

// Activer les clés étrangères
sqlite.pragma("foreign_keys = ON");

// Créer l'instance Drizzle
export const db = drizzle(sqlite, { schema });

// Export du type DB pour l'utiliser ailleurs
export type DB = typeof db;
