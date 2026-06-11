import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";

type PreviewViewport = "mobile" | "desktop";

const VIEWPORT_WIDTH: Record<PreviewViewport, number> = {
  mobile: 375,
  desktop: 600,
};

type NewsletterHtmlPreviewFrameProps = {
  html: string;
  className?: string;
};

export function NewsletterHtmlPreviewFrame({ html, className }: NewsletterHtmlPreviewFrameProps) {
  const [viewport, setViewport] = useState<PreviewViewport>("mobile");

  if (!html.trim()) {
    return <p className="p-4 text-sm text-muted-foreground">Aperçu indisponible</p>;
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          La plupart des lecteurs ouvrent le mail sur téléphone — vérifiez l&apos;aperçu mobile.
        </p>
        <div className="flex gap-1 rounded-md border p-0.5 bg-muted/40">
          <Button
            type="button"
            variant={viewport === "mobile" ? "default" : "ghost"}
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setViewport("mobile")}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Mobile
          </Button>
          <Button
            type="button"
            variant={viewport === "desktop" ? "default" : "ghost"}
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setViewport("desktop")}
          >
            <Monitor className="h-3.5 w-3.5" />
            Bureau
          </Button>
        </div>
      </div>
      <div className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-lg border bg-muted/30 p-3 sm:p-4">
        <div className="flex min-h-0 flex-1 justify-center">
          <div
            className="flex h-full w-full flex-col overflow-hidden rounded-sm border bg-white shadow-sm transition-[max-width] duration-200"
            style={{ maxWidth: VIEWPORT_WIDTH[viewport] }}
          >
            <iframe
              title="Aperçu newsletter"
              srcDoc={html}
              className="block h-full min-h-0 w-full flex-1 border-0 bg-white"
              sandbox=""
            />
          </div>
        </div>
      </div>
    </div>
  );
}
