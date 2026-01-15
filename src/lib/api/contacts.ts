import { db } from "../db";
import { contacts, type NewContact, type Contact } from "../db/schema";
import { eq, sql } from "drizzle-orm";

// Récupérer tous les contacts
export async function getAllContacts(): Promise<Contact[]> {
  try {
    return db.select().from(contacts).all();
  } catch (error) {
    console.error("Error fetching contacts:", error);
    throw error;
  }
}

// Récupérer un contact par ID
export async function getContactById(id: number): Promise<Contact | undefined> {
  try {
    return db.select().from(contacts).where(eq(contacts.id, id)).get();
  } catch (error) {
    console.error("Error fetching contact:", error);
    throw error;
  }
}

// Créer un nouveau contact
export async function createContact(data: NewContact): Promise<Contact> {
  try {
    const result = db.insert(contacts).values(data).returning().get();
    return result;
  } catch (error) {
    console.error("Error creating contact:", error);
    throw error;
  }
}

// Mettre à jour un contact
export async function updateContact(
  id: number,
  data: Partial<NewContact>
): Promise<Contact> {
  try {
    const result = db
      .update(contacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning()
      .get();
    return result;
  } catch (error) {
    console.error("Error updating contact:", error);
    throw error;
  }
}

// Supprimer un contact
export async function deleteContact(id: number): Promise<void> {
  try {
    db.delete(contacts).where(eq(contacts.id, id)).run();
  } catch (error) {
    console.error("Error deleting contact:", error);
    throw error;
  }
}

// Rechercher des contacts par nom ou email
export async function searchContacts(query: string): Promise<Contact[]> {
  try {
    // Note: SQLite ne supporte pas ILIKE, on utilise LIKE
    const searchPattern = `%${query}%`;
    return db
      .select()
      .from(contacts)
      .where(
        sql`${contacts.nom} LIKE ${searchPattern} OR ${contacts.prenom} LIKE ${searchPattern} OR ${contacts.email} LIKE ${searchPattern}`
      )
      .all();
  } catch (error) {
    console.error("Error searching contacts:", error);
    throw error;
  }
}
