export type PortalColorScheme = "system" | "light" | "dark";

export function applyPortalColorScheme(scheme: PortalColorScheme): void {
  document.documentElement.dataset.portalTheme = scheme;
}
