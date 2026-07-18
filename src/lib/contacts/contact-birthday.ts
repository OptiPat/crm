import type { Contact } from "@/lib/api/tauri-contacts";

/** Jour/mois calendaire (1–12 / 1–31) issu du timestamp stocké (minuit UTC). */
export function birthMonthDayFromUnix(unix: number): { month: number; day: number } {
  const d = new Date(unix * 1000);
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Jour/mois calendaire local (fuseau de l'utilisateur). */
export function todayMonthDayLocal(ref = new Date()): { month: number; day: number } {
  return { month: ref.getMonth() + 1, day: ref.getDate() };
}

export function isBirthdayToday(dateNaissanceUnix: number, ref = new Date()): boolean {
  const birth = birthMonthDayFromUnix(dateNaissanceUnix);
  const today = todayMonthDayLocal(ref);
  return birth.month === today.month && birth.day === today.day;
}

/** Âge atteint à la date de référence (anniversaire inclus). */
export function computeAgeAtDate(dateNaissanceUnix: number, ref = new Date()): number {
  const birth = new Date(dateNaissanceUnix * 1000);
  const birthYear = birth.getUTCFullYear();
  const birthMonth = birth.getUTCMonth();
  const birthDay = birth.getUTCDate();

  let age = ref.getFullYear() - birthYear;
  const refMonth = ref.getMonth();
  const refDay = ref.getDate();

  if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
    age -= 1;
  }
  return age;
}

export function isContactAtLeastAge(
  dateNaissanceUnix: number | undefined | null,
  minAge: number,
  ref = new Date()
): boolean {
  if (dateNaissanceUnix == null || dateNaissanceUnix === 0) return false;
  return computeAgeAtDate(dateNaissanceUnix, ref) >= minAge;
}

export function formatAgeLabel(age: number): string {
  return age <= 1 ? `${age} an` : `${age} ans`;
}

export type ContactBirthdayToday = Contact & { age: number };

export function listContactsWithBirthdayToday(
  contacts: Contact[],
  ref = new Date()
): ContactBirthdayToday[] {
  return contacts
    .filter(
      (c) =>
        c.date_naissance != null &&
        c.date_naissance !== 0 &&
        c.statut_suivi !== "ARCHIVE" &&
        isBirthdayToday(c.date_naissance, ref)
    )
    .map((c) => ({
      ...c,
      age: computeAgeAtDate(c.date_naissance!, ref),
    }))
    .sort((a, b) => {
      const nom = a.nom.localeCompare(b.nom, "fr");
      if (nom !== 0) return nom;
      return a.prenom.localeCompare(b.prenom, "fr");
    });
}
