import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PrepareStelliumPerfCampaignInput } from "@/lib/api/tauri-stellium-perf-campaign";
import {
  executePrepareStelliumPerfCampaign,
  prepareStelliumPerfCampaignFromLatestReleve,
} from "@/lib/investissements/stellium-perf-campaign";

type StelliumPerfPrepareCampaignButtonProps = {
  /** Session import : contrats éligibles du fichier. Sinon = dernier relevé Stellium en base. */
  importInput?: PrepareStelliumPerfCampaignInput | null;
  disabled?: boolean;
  variant?: "default" | "secondary" | "outline";
  size?: "default" | "sm";
  className?: string;
  label?: string;
  onPrepared?: () => void;
};

export function StelliumPerfPrepareCampaignButton({
  importInput = null,
  disabled = false,
  variant = "secondary",
  size = "default",
  className,
  label = "Préparer la campagne",
  onPrepared,
}: StelliumPerfPrepareCampaignButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const result =
        importInput != null
          ? await executePrepareStelliumPerfCampaign(importInput)
          : await prepareStelliumPerfCampaignFromLatestReleve();
      toast.success(result.message);
      onPrepared?.();
    } catch (error) {
      const msg = String(error);
      if (msg.includes("NO_STELLIUM_RELEVE")) {
        toast.error("Aucun relevé Stellium en base — importez d'abord les encours Contrats");
      } else if (importInput == null) {
        toast.error("Campagne : " + msg);
      } else if (importInput.investissementIds.length === 0) {
        toast.error("Aucun contrat éligible — importez d'abord les encours Stellium");
      } else {
        toast.error("Campagne : " + msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || busy}
      onClick={() => void handleClick()}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : (
        <Mail className="h-4 w-4 mr-1" />
      )}
      {label}
    </Button>
  );
}
