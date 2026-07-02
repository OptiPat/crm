/** Ouvre une fiche contact depuis un drill-down dashboard (liste optionnelle pour navigation). */
export type DashboardDrillDownOpenContact = (
  contactId: number,
  contactIds?: number[]
) => void;
