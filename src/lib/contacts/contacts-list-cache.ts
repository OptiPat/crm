import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";

export type ContactsListCache = {
  contacts: Contact[];
  foyers: Foyer[];
};

let cache: ContactsListCache | null = null;

export function getContactsListCache(): ContactsListCache | null {
  return cache;
}

export function setContactsListCache(next: ContactsListCache): void {
  cache = next;
}

export function patchContactInListCache(contact: Contact): void {
  if (!cache || !contact.id) return;
  cache = {
    ...cache,
    contacts: cache.contacts.map((c) => (c.id === contact.id ? contact : c)),
  };
}

export type ContactsListInitialState = ContactsListCache & {
  loading: boolean;
  hasCache: boolean;
};

export function getContactsListInitialState(): ContactsListInitialState {
  const cached = getContactsListCache();
  if (!cached) {
    return {
      contacts: [],
      foyers: [],
      loading: true,
      hasCache: false,
    };
  }
  return {
    ...cached,
    loading: false,
    hasCache: true,
  };
}
