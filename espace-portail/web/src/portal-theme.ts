export type PortalColorScheme = "system" | "light" | "dark";

export function applyPortalColorScheme(scheme: PortalColorScheme): void {
  document.documentElement.dataset.portalTheme = scheme;
}

/// Icône de l'onglet. Elle suit le logo configuré plutôt qu'un fichier figé :
/// chaque cabinet déploie le sien, et le fichier est déjà chargé par l'écran de
/// connexion, donc rien de plus à télécharger.
export function applyPortalFavicon(logoUrl: string | undefined): void {
  if (!logoUrl) return;
  const lien =
    document.querySelector<HTMLLinkElement>("link[rel='icon']") ??
    document.head.appendChild(
      Object.assign(document.createElement("link"), { rel: "icon" }),
    );
  lien.href = logoUrl;
}
