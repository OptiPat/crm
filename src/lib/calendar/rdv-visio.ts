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

export function rdvVisioToApiPayload(visio: RdvVisioOptions): {
  addGoogleMeet: boolean;
  visioLink: string | null;
} {
  if (visio.mode === "google_meet") {
    return { addGoogleMeet: true, visioLink: null };
  }
  if (visio.mode === "custom") {
    const link = visio.customLink?.trim() ?? "";
    return { addGoogleMeet: false, visioLink: link || null };
  }
  return { addGoogleMeet: false, visioLink: null };
}
