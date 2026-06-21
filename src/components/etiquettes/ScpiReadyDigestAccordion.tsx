import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import { parseScpiCampaignVariables } from "@/lib/emails/scpi-bulletin-preview-vars";
import { cn } from "@/lib/utils";

export function ScpiReadyDigestAccordion({
  item,
}: {
  item: EtiquetteEmailQueueItem;
}) {
  const [open, setOpen] = useState(false);
  const vars = parseScpiCampaignVariables(item.campaign_variables);
  const plain = vars.bulletin_resume?.trim();
  if (!plain) return null;

  const preview =
    plain.length > 320 && !open ? `${plain.slice(0, 320).trim()}…` : plain;

  return (
    <div className="mt-1 rounded-md border border-border/60 bg-muted/20 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
        />
        Aperçu digest bulletin
        {vars.periode ? ` (${vars.periode})` : ""}
      </button>
      <pre className="whitespace-pre-wrap px-2 pb-2 text-[11px] leading-relaxed text-foreground/90 font-sans">
        {preview}
      </pre>
    </div>
  );
}
