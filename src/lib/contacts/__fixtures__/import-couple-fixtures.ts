import type { Contact } from "@/lib/api/tauri-contacts";

function baseContact(
  partial: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">
): Contact {
  return {
    categorie: "CLIENT",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

/** Même nom de famille (placeholder NOM1), foyer 10 */
export const contactsSameNomCouple: Contact[] = [
  baseContact({
    id: 1,
    nom: "NOM1",
    prenom: "Jean",
    foyer_id: 10,
    role_foyer: "DECLARANT_1",
  }),
  baseContact({
    id: 2,
    nom: "NOM1",
    prenom: "Veronique",
    foyer_id: 10,
    role_foyer: "DECLARANT_2",
  }),
];

/** Noms composés NOM1 et NOM2 */
export const contactsCompositeNomCouple: Contact[] = [
  baseContact({ id: 3, nom: "NOM1", prenom: "Jeremy", foyer_id: 20 }),
  baseContact({ id: 4, nom: "NOM2", prenom: "Gaelle", foyer_id: 20 }),
];
