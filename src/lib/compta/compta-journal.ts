import type {
  ComptaDepense,
  ComptaDeplacement,
  ComptaEncaissement,
} from "@/lib/api/tauri-compta";

export type ComptaJournalEntryType = "encaissement" | "depense" | "deplacement";

export interface ComptaJournalEntry {
  date: string;
  type: ComptaJournalEntryType;
  libelle: string;
  ht: number;
  tva: number;
  ttc: number;
  don: number;
  lienDrive?: string | null;
  km?: number;
}

export interface ComptaJournalTotals {
  totalEnc: number;
  totalDep: number;
  totalKm: number;
  tvaCollectee: number;
  tvaDeductible: number;
  totalTVA: number;
  totalDons: number;
}

export function buildComptaJournalEntries(
  encaissements: ComptaEncaissement[],
  depenses: ComptaDepense[],
  deplacements: ComptaDeplacement[]
): ComptaJournalEntry[] {
  const entries: ComptaJournalEntry[] = [];

  for (const e of encaissements) {
    entries.push({
      date: e.date,
      type: "encaissement",
      libelle: e.client,
      ht: e.ht + e.exonere,
      tva: e.tva,
      ttc: e.total,
      don: e.don,
      lienDrive: e.lienDrive,
    });
  }

  for (const d of depenses) {
    entries.push({
      date: d.date,
      type: "depense",
      libelle: `${d.categorie} - ${d.tiers}`,
      ht: d.ht,
      tva: d.tva,
      ttc: d.ttc,
      don: 0,
      lienDrive: d.lienDrive,
    });
  }

  for (const d of deplacements) {
    entries.push({
      date: d.date,
      type: "deplacement",
      libelle: `${d.objet} → ${d.destination}`,
      ht: d.indemnite,
      tva: 0,
      ttc: d.indemnite,
      don: 0,
      km: d.km,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

export function computeComptaJournalTotals(
  encaissements: ComptaEncaissement[],
  depenses: ComptaDepense[],
  deplacements: ComptaDeplacement[]
): ComptaJournalTotals {
  const totalEnc = encaissements.reduce((s, e) => s + e.total, 0);
  const totalDep = depenses.reduce((s, d) => s + d.ttc, 0);
  const totalKm = deplacements.reduce((s, d) => s + d.indemnite, 0);
  const tvaCollectee = encaissements.reduce((s, e) => s + e.tva, 0);
  const tvaDeductible = depenses.reduce((s, d) => s + d.tva, 0);
  const totalDons = encaissements.reduce((s, e) => s + e.don, 0);

  return {
    totalEnc,
    totalDep,
    totalKm,
    tvaCollectee,
    tvaDeductible,
    totalTVA: tvaCollectee - tvaDeductible,
    totalDons,
  };
}

export function comptaJournalTypeLabel(type: ComptaJournalEntryType): string {
  switch (type) {
    case "encaissement":
      return "Encaissement";
    case "depense":
      return "Dépense";
    case "deplacement":
      return "Déplacement";
  }
}

export type ComptaKpiTargetTab = "encaissements" | "depenses" | "deplacements" | "journal";

export function comptaJournalTypeBadgeClass(type: ComptaJournalEntryType): string {
  switch (type) {
    case "encaissement":
      return "border-emerald-300 bg-emerald-100 text-emerald-800";
    case "depense":
      return "border-red-400 bg-red-100 text-red-800";
    case "deplacement":
      return "border-blue-300 bg-blue-100 text-blue-800";
  }
}

export function comptaTypeListCardClass(type: ComptaJournalEntryType): string {
  switch (type) {
    case "encaissement":
      return "border-l-4 border-l-emerald-500";
    case "depense":
      return "border-l-4 border-l-red-500";
    case "deplacement":
      return "border-l-4 border-l-blue-500";
  }
}

export function comptaJournalTypeAmountClass(type: ComptaJournalEntryType): string {
  switch (type) {
    case "encaissement":
      return "text-emerald-600";
    case "depense":
      return "text-red-600";
    case "deplacement":
      return "text-blue-600";
  }
}
