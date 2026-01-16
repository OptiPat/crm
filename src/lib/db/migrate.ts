import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export function runMigrations() {
  try {
    const sqlite = new Database("patrimoine-crm.db");
    const db = drizzle(sqlite);
    
    // Exécuter les migrations
    migrate(db, { migrationsFolder: "./drizzle" });
    
    console.log("✅ Migrations executed successfully!");
    sqlite.close();
    
    return { success: true };
  } catch (error) {
    console.error("❌ Migration failed:", error);
    return { success: false, error: String(error) };
  }
}

// Si ce fichier est exécuté directement (désactivé pour Tauri)
// runMigrations();
