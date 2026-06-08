import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  applyGoogleContactNameProposal,
  dismissGoogleContactNameProposal,
  googleContactSyncToastMessage,
  listGoogleContactNameProposals,
  type GoogleContactNameProposal,
} from "@/lib/api/tauri-google-contacts";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";
import { toast } from "sonner";

type GoogleContactNameProposalsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatCoords(email: string | null, phone: string | null): string {
  const parts: string[] = [];
  if (email?.trim()) parts.push(email.trim());
  if (phone?.trim()) parts.push(phone.trim());
  return parts.length > 0 ? parts.join(" · ") : "Sans email ni tél";
}

export function GoogleContactNameProposalsDialog({
  open,
  onOpenChange,
}: GoogleContactNameProposalsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [proposals, setProposals] = useState<GoogleContactNameProposal[]>([]);
  const [scanned, setScanned] = useState(false);

  const runScan = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listGoogleContactNameProposals();
      setProposals(list);
      setScanned(true);
      if (list.length === 0) {
        toast.info("Aucune proposition nom/prénom à valider.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analyse Google Contacts impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setProposals([]);
      setScanned(false);
      setApplyingKey(null);
    }
  };

  const dismissProposal = (contactId: number) => {
    setProposals((prev) => prev.filter((p) => p.contactId !== contactId));
  };

  const handleDismiss = async (contactId: number) => {
    try {
      await dismissGoogleContactNameProposal(contactId);
      dismissProposal(contactId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer l'ignoré.");
    }
  };

  const handleApply = async (proposal: GoogleContactNameProposal, resourceName: string) => {
    const key = `${proposal.contactId}:${resourceName}`;
    setApplyingKey(key);
    try {
      const result = await applyGoogleContactNameProposal(proposal.contactId, resourceName);
      notifyContactsChanged();
      dismissProposal(proposal.contactId);
      toast.success(googleContactSyncToastMessage(result));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Association impossible.");
    } finally {
      setApplyingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Propositions nom / prénom (Google)</DialogTitle>
          <DialogDescription>
            Contacts CRM sans correspondance email/tél Google, avec un homonyme probable. Validez
            manuellement — le CRM peut compléter email/tél vides, sans modifier le nom.
          </DialogDescription>
        </DialogHeader>

        {!scanned ? (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Analyse l&apos;index Google Contacts (une passe). Aucune modification automatique.
            </p>
            <Button type="button" disabled={loading} onClick={() => void runScan()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyse en cours…
                </>
              ) : (
                "Lancer l'analyse"
              )}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {proposals.length} proposition(s) restante(s)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void runScan()}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Relancer"}
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/80 divide-y divide-border/60">
              {proposals.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Toutes les propositions ont été traitées ou aucune correspondance trouvée.
                </p>
              ) : (
                proposals.map((proposal) => (
                  <div key={proposal.contactId} className="px-3 py-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {proposal.prenom} {proposal.nom}
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · #{proposal.contactId}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          CRM : {formatCoords(proposal.crmEmail, proposal.crmPhone)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={applyingKey !== null}
                        onClick={() => void handleDismiss(proposal.contactId)}
                      >
                        Ignorer
                      </Button>
                    </div>

                    <ul className="space-y-2 pl-1">
                      {proposal.candidates.map((c) => {
                        const key = `${proposal.contactId}:${c.resourceName}`;
                        const busy = applyingKey === key;
                        return (
                          <li
                            key={c.resourceName}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
                          >
                            <div className="text-sm">
                              <span className="font-medium">
                                {c.googlePrenom} {c.googleNom}
                              </span>
                              <span className="text-muted-foreground text-xs block mt-0.5">
                                Google : {formatCoords(c.googleEmail, c.googlePhone)}
                              </span>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={applyingKey !== null}
                              onClick={() => void handleApply(proposal, c.resourceName)}
                            >
                              {busy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Associer"
                              )}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
