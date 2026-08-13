import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cancelEspaceDemande,
  createEspaceDemande,
  importEspaceDepots,
  listEspaceDemandes,
  listEspaceScpiDeclarationsPending,
  listEspaceAvoirPending,
  type EspaceDemande,
} from "@/lib/api/tauri-espace-client";
import { ESPACE_CLIENT_CHANGED_EVENT } from "@/lib/espace-client/espace-client-events";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import { notifyDocumentsChanged } from "@/lib/documents/document-events";
import {
  espaceDemandeGroupLabel,
  loadEspaceDemandeOptions,
  resolveEspaceDemandeSelection,
  type EspaceDemandeOption,
  type EspaceDemandeOptionGroup,
} from "@/lib/espace-client/espace-demande-options";
import {
  ESPACE_DEMANDE_STATUT,
  formatEspaceDemandeStatut,
  formatEspaceTimestamp,
} from "@/lib/espace-client/espace-client-format";
import { cn } from "@/lib/utils";

export interface ContactEspaceDemandesPanelProps {
  contactId: number;
  accesActif: boolean;
}

function statutBadgeClass(statut: string): string {
  switch (statut) {
    case ESPACE_DEMANDE_STATUT.RECU:
      return "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200";
    case ESPACE_DEMANDE_STATUT.VALIDE:
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
    case ESPACE_DEMANDE_STATUT.ANNULE:
      return "border-muted bg-muted/40 text-muted-foreground";
    default:
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
  }
}

export function ContactEspaceDemandesPanel({
  contactId,
  accesActif,
}: ContactEspaceDemandesPanelProps) {
  const [demandes, setDemandes] = useState<EspaceDemande[]>([]);
  const [options, setOptions] = useState<EspaceDemandeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingScpiCount, setPendingScpiCount] = useState(0);
  const [pendingAvoirDeclarations, setPendingAvoirDeclarations] = useState(0);
  const [pendingAvoirRetraits, setPendingAvoirRetraits] = useState(0);
  const [templateKey, setTemplateKey] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, opts, scpiPending, avoirPending] = await Promise.all([
        listEspaceDemandes(contactId),
        loadEspaceDemandeOptions(),
        listEspaceScpiDeclarationsPending(contactId).catch(() => []),
        listEspaceAvoirPending(contactId).catch(() => ({
          declarations: 0,
          retraits: 0,
        })),
      ]);
      setDemandes(rows);
      setOptions(opts);
      setPendingScpiCount(scpiPending.length);
      setPendingAvoirDeclarations(avoirPending.declarations);
      setPendingAvoirRetraits(avoirPending.retraits);
      if (!templateKey && opts.length > 0) {
        setTemplateKey(opts[0].templateKey);
      }
    } catch {
      toast.error("Impossible de charger les demandes de documents");
    } finally {
      setLoading(false);
    }
  }, [contactId, templateKey]);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
  }, [load]);

  const pendingImportCount = demandes.filter(
    (d) => d.statut === ESPACE_DEMANDE_STATUT.RECU
  ).length;

  const pendingPortalCount =
    pendingImportCount +
    pendingScpiCount +
    pendingAvoirDeclarations +
    pendingAvoirRetraits;

  const groupedOptions = useMemo(() => {
    const groups = new Map<EspaceDemandeOptionGroup, EspaceDemandeOption[]>();
    for (const opt of options) {
      const list = groups.get(opt.group) ?? [];
      list.push(opt);
      groups.set(opt.group, list);
    }
    return groups;
  }, [options]);

  const handleCreate = async () => {
    const resolved = resolveEspaceDemandeSelection(
      options,
      templateKey,
      customLabel
    );
    if (!resolved) {
      toast.error("Sélectionnez un document ou saisissez un libellé");
      return;
    }
    setSaving(true);
    try {
      await createEspaceDemande(
        contactId,
        resolved.typeDocument,
        resolved.templateKey,
        resolved.libelle
      );
      setCustomLabel("");
      toast.success("Demande créée et synchronisée vers le portail");
      await load();
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Création impossible");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (demandeId: number) => {
    setSaving(true);
    try {
      await cancelEspaceDemande(demandeId);
      toast.success("Demande annulée");
      await load();
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Annulation impossible");
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await importEspaceDepots(contactId);
      const parts: string[] = [];
      if (result.imported > 0) {
        notifyDocumentsChanged();
        parts.push(`${result.imported} document(s) importé(s) dans la GED`);
      }
      if (result.scpiDeclarationsImported > 0) {
        parts.push(
          `${result.scpiDeclarationsImported} mise(s) à jour importée(s)`
        );
      }
      if (result.avoirsImported > 0) {
        parts.push(`${result.avoirsImported} avoir(s) déclaré(s) importé(s)`);
      }
      if (result.declareClientPromoted > 0) {
        parts.push(
          `${result.declareClientPromoted} déclaration(s) reprise(s) à côté`
        );
      }
      if (result.avoirsRetires > 0) {
        parts.push(`${result.avoirsRetires} avoir(s) retiré(s)`);
      }
      if (parts.length > 0) {
        toast.success(parts.join(" · "));
      } else if (result.errors.length === 0) {
        toast.message("Aucun dépôt ni déclaration en attente sur le portail");
      }
      for (const err of result.errors) {
        toast.error(err);
      }
      await load();
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Import impossible");
    } finally {
      setImporting(false);
    }
  };

  if (!accesActif) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Demandes de documents</p>
        {pendingPortalCount > 0 ? (
          <Badge variant="outline" className="font-normal">
            {[
              pendingImportCount > 0 ? `${pendingImportCount} dépôt(s)` : null,
              pendingScpiCount > 0 ? `${pendingScpiCount} SCPI` : null,
              pendingAvoirDeclarations > 0
                ? `${pendingAvoirDeclarations} avoir(s)`
                : null,
              pendingAvoirRetraits > 0
                ? `${pendingAvoirRetraits} retrait(s)`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
            à importer
          </Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Le client reçoit un email à la création. Après dépôt, déclaration ou
        retrait sur le portail, importez dans le CRM.
      </p>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-2">
          <Label className="text-xs">Document demandé</Label>
          <Select value={templateKey} onValueChange={setTemplateKey}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choisir un document" />
            </SelectTrigger>
            <SelectContent>
              {[...groupedOptions.entries()].map(([group, items]) => (
                <SelectGroup key={group}>
                  <SelectLabel>{espaceDemandeGroupLabel(group)}</SelectLabel>
                  {items.map((item) => (
                    <SelectItem key={item.templateKey} value={item.templateKey}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {templateKey === "custom" ? (
            <Input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Libellé personnalisé"
              className="h-9"
              disabled={saving}
            />
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9"
          disabled={loading || saving || !templateKey}
          onClick={() => void handleCreate()}
        >
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Créer la demande
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={loading || importing}
          onClick={() => void handleImport()}
        >
          {importing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileUp className="mr-1.5 h-3.5 w-3.5" />
          )}
          Récupérer l'espace client
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Chargement…
        </div>
      ) : demandes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune demande pour l'instant.</p>
      ) : (
        <ul className="max-h-48 space-y-2 overflow-y-auto">
          {demandes.map((demande) => (
            <li
              key={demande.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">{demande.libelle}</p>
                <p className="text-muted-foreground">
                  {formatEspaceTimestamp(demande.demande_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("font-normal", statutBadgeClass(demande.statut))}
                >
                  {formatEspaceDemandeStatut(demande.statut)}
                </Badge>
                {demande.statut === ESPACE_DEMANDE_STATUT.EN_ATTENTE ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={saving}
                    onClick={() => void handleCancel(demande.id)}
                    title="Annuler"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
