import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyClientOneDriveFolderProposal,
  proposeClientOneDriveFolderMatches,
  type ClientOneDriveFolderProposal,
} from "@/lib/api/tauri-client-onedrive";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import { notifyClientOneDriveChanged } from "@/lib/client-onedrive/client-onedrive-events";
import { toast } from "sonner";

function ProposalRow({
  proposal,
  applyingId,
  onApply,
  actionLabel,
  renameTo,
}: {
  proposal: ClientOneDriveFolderProposal;
  applyingId: string | null;
  onApply: (proposal: ClientOneDriveFolderProposal, renameTo?: string | null) => void;
  actionLabel: string;
  renameTo?: string | null;
}) {
  const busy = applyingId === proposal.folderId;
  const showRename =
    renameTo != null && renameTo.length > 0 && renameTo !== proposal.folderName;

  return (
    <li className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{proposal.folderName}</div>
        <div className="text-xs text-muted-foreground truncate">
          {showRename ? (
            <>
              → <span className="text-foreground font-medium">{renameTo}</span>
              <span className="mx-1">·</span>
              {proposal.label}
            </>
          ) : (
            <>→ {proposal.label}</>
          )}
        </div>
      </div>
      <Badge variant="outline">{proposal.source === "foyer" ? "Couple" : "Contact"}</Badge>
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={() => onApply(proposal, renameTo)}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {showRename ? (
              <Pencil className="h-4 w-4 mr-1" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            {actionLabel}
          </>
        )}
      </Button>
    </li>
  );
}

export function ClientOneDriveLinkWizard({
  open,
  onOpenChange,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<ClientOneDriveFolderProposal[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProposals(await proposeClientOneDriveFolderMatches());
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Analyse impossible");
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const exact = useMemo(
    () =>
      proposals.filter(
        (p) =>
          (p.matchKind === "exact" || p.matchKind === "existing") && !p.suggestedFolderName
      ),
    [proposals]
  );
  const renameProposals = useMemo(
    () => proposals.filter((p) => p.suggestedFolderName),
    [proposals]
  );
  const ambiguous = useMemo(
    () => proposals.filter((p) => p.confidence === "ambiguous"),
    [proposals]
  );
  const unmatched = useMemo(
    () => proposals.filter((p) => p.confidence === "none"),
    [proposals]
  );

  const apply = async (
    proposal: ClientOneDriveFolderProposal,
    renameTo?: string | null
  ) => {
    setApplyingId(proposal.folderId);
    try {
      await applyClientOneDriveFolderProposal(proposal, {
        renameTo: renameTo ?? null,
      });
      setProposals((prev) => prev.filter((p) => p.folderId !== proposal.folderId));
      onUpdated?.();
      notifyClientOneDriveChanged();
      const finalName = renameTo?.trim() || proposal.folderName;
      toast.success(
        renameTo?.trim()
          ? `Dossier renommé et relié : ${finalName}`
          : `Dossier relié : ${finalName}`
      );
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Liaison impossible");
    } finally {
      setApplyingId(null);
    }
  };

  const applyAllRename = async () => {
    if (renameProposals.length === 0) return;
    setBatchBusy(true);
    let ok = 0;
    for (const proposal of renameProposals) {
      try {
        await applyClientOneDriveFolderProposal(proposal, {
          renameTo: proposal.suggestedFolderName,
        });
        ok += 1;
        setProposals((prev) => prev.filter((p) => p.folderId !== proposal.folderId));
      } catch (e) {
        toast.error(`${proposal.folderName} : ${invokeErrorMessage(e)}`);
        break;
      }
    }
    if (ok > 0) {
      onUpdated?.();
      notifyClientOneDriveChanged();
      toast.success(`${ok} dossier${ok > 1 ? "s" : ""} renommé${ok > 1 ? "s" : ""} et relié${ok > 1 ? "s" : ""}`);
    }
    setBatchBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Rattacher les dossiers OneDrive</DialogTitle>
          <DialogDescription>
            Convention CRM <strong>NOM Prénom</strong> (ex. <strong>MERIAU Tifène</strong>). Les
            dossiers en nom seul ou en ordre inversé (<strong>Prénom NOM</strong>) peuvent être
            renommés automatiquement sur OneDrive.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyse des dossiers…
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto pr-1">
            {renameProposals.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-sm font-medium">
                    Renommage proposé ({renameProposals.length})
                  </h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={batchBusy || applyingId != null}
                    onClick={() => void applyAllRename()}
                  >
                    {batchBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Tout renommer et relier"
                    )}
                  </Button>
                </div>
                <ul className="space-y-2">
                  {renameProposals.map((p) => (
                    <ProposalRow
                      key={p.folderId}
                      proposal={p}
                      applyingId={applyingId}
                      renameTo={p.suggestedFolderName}
                      actionLabel="Renommer et relier"
                      onApply={apply}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {exact.length > 0 ? (
              <section className="space-y-2">
                <h4 className="text-sm font-medium">Déjà au bon format ({exact.length})</h4>
                <ul className="space-y-2">
                  {exact.map((p) => (
                    <ProposalRow
                      key={p.folderId}
                      proposal={p}
                      applyingId={applyingId}
                      actionLabel="Relier"
                      onApply={apply}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {ambiguous.length > 0 ? (
              <section className="space-y-2">
                <h4 className="text-sm font-medium text-amber-800">
                  Homonymes — à traiter manuellement ({ambiguous.length})
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground max-h-36 overflow-y-auto">
                  {ambiguous.map((p) => (
                    <li key={p.folderId} className="px-1">
                      <span className="font-medium text-foreground">{p.folderName}</span>
                      {" — "}
                      {p.label}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {unmatched.length > 0 ? (
              <section className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Non reconnus ({unmatched.length})
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground max-h-36 overflow-y-auto">
                  {unmatched.map((p) => (
                    <li key={p.folderId} className="truncate px-1">
                      {p.folderName}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {proposals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Aucun dossier à analyser. Vérifiez le dossier racine dans les paramètres.
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
