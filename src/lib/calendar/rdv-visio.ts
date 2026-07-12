import { getCgpConfig } from "@/lib/api/tauri-settings";

export type RdvVisioMode = "none" | "google_meet" | "custom";

export interface RdvVisioOptions {
  mode: RdvVisioMode;
  /** Lien Zoom, Teams, etc. — utilisé si mode = custom */
  customLink?: string | null;
}

export function defaultRdvVisioFromCgp(
  cgp: { default_visio_link?: string | null } | null | undefined
): { mode: RdvVisioMode; customLink: string } {
  const link = cgp?.default_visio_link?.trim() ?? "";
  if (link) return { mode: "custom", customLink: link };
  // Google Meet se crée via l'API — pas besoin de lien en paramètres.
  return { mode: "google_meet", customLink: "" };
}

/** Visio par défaut (Paramètres → Agenda & RDV) pour les RDV Pipe. */
export async function loadDefaultPipeRdvVisio(): Promise<RdvVisioOptions> {
  const cgp = await getCgpConfig();
  return defaultRdvVisioFromCgp(cgp);
}

export function rdvVisioToApiPayload(
  visio: RdvVisioOptions,
  physicalAddress?: string | null
): {
  addGoogleMeet: boolean;
  visioLink: string | null;
  eventLocation: string | null;
} {
  if (visio.mode === "google_meet") {
    return { addGoogleMeet: true, visioLink: null, eventLocation: null };
  }
  if (visio.mode === "custom") {
    const link = visio.customLink?.trim() ?? "";
    return { addGoogleMeet: false, visioLink: link || null, eventLocation: link || null };
  }
  const addr = physicalAddress?.trim() ?? "";
  return { addGoogleMeet: false, visioLink: null, eventLocation: addr || null };
}
