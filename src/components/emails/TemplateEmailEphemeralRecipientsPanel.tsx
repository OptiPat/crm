import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  previewEphemeralCampaignAudience,
  syncEphemeralCampaignQueue,
  type EphemeralCampaignAudiencePreview,
} from "@/lib/api/tauri-ephemeral-campaign";
import { RefreshCw, Users, Play } from "lucide-react";
import { toast } from "sonner";

type Props = {
  templateId: number | null;
  excludedContactIds: number[];
  needsSaveBeforeSync?: boolean;
  bootstrapPending?: boolean;
  onRequestSave?: () => Promise<void>;
  onExcludedChange: (ids: number[]) => void;
  campaignStatus: string;
  onCampaignUpdated?: () => void | Promise<void>;
};

export function TemplateEmailEphemeralRecipientsPanel({
  templateId,
  excludedContactIds,
  needsSaveBeforeSync = false,
  bootstrapPending = false,
  onRequestSave,
  onExcludedChange,
  campaignStatus,
  onCampaignUpdated,
}: Props) {
  const [preview, setPreview] = useState<EphemeralCampaignAudiencePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  const excludedSet = useMemo(() => new Set(excludedContactIds), [excludedContactIds]);

  const displayPreview = useMemo(() => {
    if (!preview) return null;
    let eligible_count = 0;
    let excluded_count = 0;
    let no_email_count = 0;
    const members = preview.members.map((m) => {
      const excluded = excludedSet.has(m.contact_id);
      if (excluded) excluded_count += 1;
      else {
        eligible_count += 1;
        if (!m.has_email) no_email_count += 1;
      }
      return { ...m, excluded };
    });
    return {
      ...preview,
      eligible_count,
      excluded_count,
      no_email_count,
      members,
    };
  }, [preview, excludedSet]);

  const loadPreview = useCallback(async () => {
    if (templateId == null) return;
    setLoadingPreview(true);
    try {
      const data = await previewEphemeralCampaignAudience(templateId);
      setPreview(data);
    } catch (error) {
      console.error(error);
      toast.error("Impossible de calculer la liste");
    } finally {
      setLoadingPreview(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (templateId != null) {
      void loadPreview();
    } else {
      setPreview(null);
    }
  }, [templateId, loadPreview]);

  const filteredMembers = useMemo(() => {
    if (!displayPreview) return [];
    const q = search.trim().toLowerCase();
    return displayPreview.members.filter((m) => {
      if (!q) return true;
      return (
        m.nom.toLowerCase().includes(q) ||
        m.prenom.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [displayPreview, search]);

  const toggleExcluded = (contactId: number, included: boolean) => {
    if (included) {
      onExcludedChange(excludedContactIds.filter((id) => id !== contactId));
    } else {
      onExcludedChange([...excludedContactIds, contactId]);
    }
  };

  const handleSync = async () => {
    if (templateId == null) return;
    setSyncing(true);
    try {
      if (needsSaveBeforeSync && onRequestSave) {
        await onRequestSave();
      }
      const result = await syncEphemeralCampaignQueue(templateId);
      toast.success(result.message);
      toast.info("Envoyez depuis Suivi → Envois → Prêts à envoyer", { duration: 6000 });
      await loadPreview();
      await onCampaignUpdated?.();
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg !== "validation" && msg !== "Enregistrement déjà en cours" && msg !== "closed") {
        toast.error(
          msg.includes("Failed")
            ? "Erreur lors de la préparation de la file"
            : msg.replace(/^Failed to [^:]+:\s*/i, "")
        );
      }
    } finally {
      setSyncing(false);
    }
  };

  if (templateId == null) {
    return (
      <p className="text-sm text-center text-muted-foreground py-8 border border-dashed rounded-lg">
        {bootstrapPending
          ? "Enregistrement en cours — calcul de la cible…"
          : "Renseignez nom, objet, message et audience — l’onglet enregistre automatiquement pour afficher la liste."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3.5 w-3.5" />
            {displayPreview?.eligible_count ?? "—"} éligible(s)
          </Badge>
          {displayPreview != null && displayPreview.excluded_count > 0 && (
            <Badge variant="outline">{displayPreview.excluded_count} exclu(s)</Badge>
          )}
          {displayPreview != null && displayPreview.no_email_count > 0 && (
            <Badge variant="outline" className="text-amber-800 border-amber-300">
              {displayPreview.no_email_count} sans email
            </Badge>
          )}
          {preview != null && preview.queued_count > 0 && (
            <Badge variant="outline" className="text-primary border-primary/30">
              {preview.queued_count} en file
            </Badge>
          )}
          {campaignStatus === "prepared" && (
            <Badge className="bg-violet-100 text-violet-900 hover:bg-violet-100">File préparée</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loadingPreview}
            onClick={() => void loadPreview()}
          >
            <RefreshCw className={`h-4 w-4 ${loadingPreview ? "animate-spin" : ""}`} />
            Actualiser la liste
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={syncing || campaignStatus === "archived"}
            onClick={() => void handleSync()}
          >
            <Play className="h-4 w-4" />
            {syncing
              ? "Préparation…"
              : needsSaveBeforeSync
                ? "Enregistrer et préparer la campagne"
                : "Préparer la campagne"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Décochez un contact pour l&apos;exclure, puis{" "}
        <strong>Préparer la campagne</strong>. Les envois se font dans{" "}
        <strong>Suivi → Envois → Prêts à envoyer</strong>. Pour tout arrêter :{" "}
        <strong>Abandonner</strong> (bas de la fenêtre) ou{" "}
        <strong>Modèles → supprimer</strong>. Après le dernier envoi, la campagne disparaît
        automatiquement de la bibliothèque.
      </p>
      {needsSaveBeforeSync && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Modifications non enregistrées (message, audience ou exclusions) — le bouton ci-dessus
          enregistre puis prépare la campagne.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="recipient-search">Filtrer la liste</Label>
        <Input
          id="recipient-search"
          placeholder="Nom, prénom, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
        {loadingPreview && !displayPreview ? (
          <p className="text-sm text-muted-foreground p-4 text-center">Calcul…</p>
        ) : filteredMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">
            Aucun contact ne correspond aux filtres produits.
          </p>
        ) : (
          filteredMembers.map((m) => {
            const included = !excludedSet.has(m.contact_id);
            return (
              <label
                key={m.contact_id}
                className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer text-sm"
              >
                <Checkbox
                  checked={included}
                  onCheckedChange={(checked) =>
                    toggleExcluded(m.contact_id, checked === true)
                  }
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {m.prenom} {m.nom}
                  </span>
                  {!m.has_email && (
                    <Badge variant="outline" className="ml-2 text-[10px] text-amber-800">
                      sans email
                    </Badge>
                  )}
                  {m.email && (
                    <span className="block text-xs text-muted-foreground truncate">{m.email}</span>
                  )}
                  {m.matched_produits.length > 0 && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {m.matched_produits.join(" · ")}
                    </span>
                  )}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
