import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadIdentityDocumentPreviewPages } from "@/lib/documents/identity-document-preview";

interface RioPdfPreviewPanelProps {
  pdfPath?: string;
  active?: boolean;
}

export function RioPdfPreviewPanel({ pdfPath, active = true }: RioPdfPreviewPanelProps) {
  const [pages, setPages] = useState<Awaited<ReturnType<typeof loadIdentityDocumentPreviewPages>>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active || !pdfPath?.trim()) {
      setPages([]);
      return;
    }

    let cancelled = false;

    const path = pdfPath.trim();

    async function load() {
      setLoading(true);
      try {
        const loaded = await loadIdentityDocumentPreviewPages(path);
        if (!cancelled) setPages(loaded);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [active, pdfPath]);

  if (!pdfPath) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Aucun PDF sélectionné
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-2 lg:max-h-[calc(90vh-12rem)]">
      <p className="text-xs text-muted-foreground">
        Aperçu du document — faites défiler pour parcourir les pages.
      </p>

      {loading && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Chargement du PDF…
        </div>
      )}

      {!loading && pages.length > 0 && (
        <div className="min-h-[280px] flex-1 space-y-4 overflow-y-auto rounded-lg border bg-muted/20 p-2">
          {pages.map((page, index) => (
            <div key={`${page.label}-${index}`} className="space-y-1">
              {pages.length > 1 && (
                <p className="text-xs font-medium text-muted-foreground px-1">{page.label}</p>
              )}
              <img
                src={page.dataUrl}
                alt={page.label}
                className="w-full rounded border bg-white shadow-sm"
              />
            </div>
          ))}
        </div>
      )}

      {!loading && pages.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Impossible d&apos;afficher l&apos;aperçu PDF
        </div>
      )}
    </div>
  );
}
