import { isDeclareClientOrigine } from "@/lib/investissements/investissement-origine";

/** Le client ne retire que ce qu'il a déclaré lui-même. */
export function canClientRetirerAvoir(origine: string | undefined): boolean {
  return isDeclareClientOrigine(origine);
}
