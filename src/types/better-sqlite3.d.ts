declare module "better-sqlite3" {
  interface Database {
    pragma(pragma: string): unknown;
    close(): void;
  }
  
  interface DatabaseConstructor {
    new (filename: string, options?: unknown): Database;
    (filename: string, options?: unknown): Database;
  }
  
  const Database: DatabaseConstructor;
  export = Database;
}
