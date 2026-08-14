import { createPortal } from "react-dom";
import { useClientPreviewOverlayPortal } from "./client-preview-overlay";

interface ClientPreviewWhatsAppFabProps {
  url: string;
}

/** Glyphe WhatsApp (bulle + combiné), à poser en blanc sur un disque vert. */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2m5.79 14.08c-.24.68-1.39 1.25-1.94 1.33-.52.08-1.06.12-1.71-.11-.39-.13-.9-.29-1.56-.57-2.75-1.19-4.54-3.97-4.68-4.16-.14-.19-1.17-1.56-1.17-2.98 0-1.42.74-2.12 1.01-2.41.26-.29.58-.36.77-.36h.55c.18 0 .41-.07.64.49.24.58.82 2 .89 2.14.07.14.12.31.02.49-.1.19-.15.31-.29.48-.14.16-.3.37-.43.49-.14.14-.29.29-.12.56.16.28.72 1.19 1.55 1.93 1.07.95 1.97 1.25 2.25 1.39.28.14.44.12.6-.07.16-.19.69-.81.87-1.08.18-.28.37-.23.62-.14.26.09 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z"
      />
    </svg>
  );
}

/**
 * Logo WhatsApp flottant en bas à droite.
 *
 * Porté dans la couche overlay du cadre : l'aperçu CRM le montre dans le
 * téléphone / la fenêtre, le portail réel au coin de l'écran.
 */
export function ClientPreviewWhatsAppFab({ url }: ClientPreviewWhatsAppFabProps) {
  const overlayPortal = useClientPreviewOverlayPortal();
  if (!overlayPortal) return null;

  return createPortal(
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Discuter sur WhatsApp"
      title="Discuter sur WhatsApp"
      className="absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_6px_18px_rgba(37,211,102,0.45)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
    >
      <WhatsAppGlyph className="h-[1.35rem] w-[1.35rem]" />
    </a>,
    overlayPortal
  );
}
