import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, CheckCircle, AlertTriangle } from "lucide-react";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { contactNameKeyCanonical } from "@/lib/contacts/name-match";
import {
  formatIdentityLine,
  getIdentityConflictMessages,
} from "@/lib/contacts/duplicate-identity";
import { mergeDuplicateGroup } from "@/lib/contacts/merge-duplicate-group";
import { toast } from "sonner";

interface ContactDeduplicateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ReviewGroup {
  key: string;
  label: string;
  contacts: Contact[];
  reasons: string[];
}

type Phase = "intro" | "review" | "done";

interface DeduplicateResult {
  merged: number;
  kept: number;
  skipped: number;
}

export function ContactDeduplicate({ open, onOpenChange, onSuccess }: ContactDeduplicateProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [working, setWorking] = useState(false);
  const [reviewGroups, setReviewGroups] = useState<ReviewGroup[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [result, setResult] = useState<DeduplicateResult | null>(null);

  const resetState = () => {
    setPhase("intro");
    setReviewGroups([]);
    setReviewIndex(0);
    setResult(null);
    setWorking(false);
  };

  const handleClose = () => {
    if (result) onSuccess?.();
    resetState();
    onOpenChange(false);
  };

  const buildGroups = (contacts: Contact[]) => {
    const groups = new Map<string, Contact[]>();
    contacts.forEach((contact) => {
      const key = contactNameKeyCanonical(contact.nom, contact.prenom);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(contact);
    });
    return groups;
  };

  const handleStart = async () => {
    setWorking(true);
    const partial: DeduplicateResult = { merged: 0, kept: 0, skipped: 0 };

    try {
      const contacts = await getAllContacts();
      const groups = buildGroups(contacts);
      const ambiguous: ReviewGroup[] = [];

      for (const [key, duplicates] of groups) {
        if (duplicates.length <= 1) continue;

        const reasons = getIdentityConflictMessages(duplicates);
        if (reasons.length > 0) {
          ambiguous.push({
            key,
            label: `${duplicates[0].prenom} ${duplicates[0].nom}`,
            contacts: duplicates,
            reasons,
          });
          continue;
        }

        const removed = await mergeDuplicateGroup(duplicates);
        partial.merged += removed;
        partial.kept += 1;
      }

      if (ambiguous.length > 0) {
        setResult(partial);
        setReviewGroups(ambiguous);
        setReviewIndex(0);
        setPhase("review");
        toast.info(
          `${partial.merged} fusion(s) automatique(s). ${ambiguous.length} cas à valider (coordonnées différentes).`
        );
      } else {
        setResult(partial);
        setPhase("done");
        toast.success(
          partial.merged > 0
            ? `${partial.merged} doublon${partial.merged > 1 ? "s" : ""} fusionné${partial.merged > 1 ? "s" : ""}`
            : "Aucun doublon à fusionner"
        );
      }
    } catch (error) {
      console.error("Error deduplicating:", error);
      toast.error("Erreur lors de la déduplication: " + String(error));
    } finally {
      setWorking(false);
    }
  };

  const finishReview = (final: DeduplicateResult) => {
    setReviewGroups([]);
    setResult(final);
    setPhase("done");
    toast.success(
      `${final.merged} fusion(s), ${final.skipped} homonyme${final.skipped > 1 ? "s" : ""} laissé${final.skipped > 1 ? "s" : ""} séparé${final.skipped > 1 ? "s" : ""}`
    );
  };

  const handleReviewMerge = async () => {
    const group = reviewGroups[reviewIndex];
    if (!group || !result) return;

    setWorking(true);
    try {
      const removed = await mergeDuplicateGroup(group.contacts);
      const next: DeduplicateResult = {
        ...result,
        merged: result.merged + removed,
        kept: result.kept + 1,
      };

      const remaining = reviewGroups.filter((_, i) => i !== reviewIndex);
      if (remaining.length === 0) {
        finishReview(next);
      } else {
        setResult(next);
        setReviewGroups(remaining);
        setReviewIndex(0);
      }
    } catch (error) {
      console.error("Error merging review group:", error);
      toast.error("Erreur fusion: " + String(error));
    } finally {
      setWorking(false);
    }
  };

  const handleReviewSkip = () => {
    if (!result) return;
    const next: DeduplicateResult = {
      ...result,
      skipped: result.skipped + 1,
    };

    const remaining = reviewGroups.filter((_, i) => i !== reviewIndex);
    if (remaining.length === 0) {
      finishReview(next);
    } else {
      setResult(next);
      setReviewGroups(remaining);
      setReviewIndex(0);
    }
  };

  const currentReview = reviewGroups[reviewIndex];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Dédupliquer les contacts
          </DialogTitle>
          <DialogDescription>
            Même nom et prénom : fusion automatique seulement si email et téléphone
            concordent ou sont vides. Sinon, validation manuelle.
          </DialogDescription>
        </DialogHeader>

        {phase === "intro" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium">Cette action va :</p>
              <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc list-inside">
                <li>Fusionner les vrais doublons (coordonnées compatibles)</li>
                <li>Vous demander si email ou tél diffèrent (homonyme possible)</li>
                <li>Garder la fiche la plus ancienne, transférer investissements et documents</li>
              </ul>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-900">
                Irréversible pour les fusions confirmées. Sauvegarde recommandée.
              </p>
            </div>
          </div>
        )}

        {phase === "review" && currentReview && result && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="text-sm text-amber-900">
                <p className="font-medium">
                  Homonyme ? ({reviewIndex + 1}/{reviewGroups.length}) — {currentReview.label}
                </p>
                <p className="mt-1 text-amber-800">
                  {currentReview.reasons.join(" · ")} — confirmez s&apos;il s&apos;agit de la même
                  personne.
                </p>
              </div>
            </div>

            <div className="border rounded-lg divide-y text-sm">
              {currentReview.contacts.map((c) => (
                <div key={c.id} className="p-3 space-y-1">
                  <p className="font-medium">
                    Fiche #{c.id} — {c.prenom} {c.nom}
                    {c.id ===
                      Math.min(...currentReview.contacts.map((x) => x.id!)) && (
                      <span className="text-muted-foreground font-normal"> (serait gardée)</span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">{formatIdentityLine(c)}</p>
                </div>
              ))}
            </div>

            {result.merged > 0 && (
              <p className="text-xs text-muted-foreground">
                Déjà fusionné automatiquement : {result.merged} fiche
                {result.merged > 1 ? "s" : ""}.
              </p>
            )}
          </div>
        )}

        {phase === "done" && result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div className="text-sm text-green-900">
              <p className="font-medium">Terminé</p>
              <p className="mt-1 text-green-800">
                {result.merged} fusion{result.merged > 1 ? "s" : ""},{" "}
                {result.skipped} homonyme{result.skipped > 1 ? "s" : ""} non fusionné
                {result.skipped > 1 ? "s" : ""}.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {phase === "intro" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Annuler
              </Button>
              <Button onClick={handleStart} disabled={working}>
                {working ? "Analyse..." : "Analyser et dédupliquer"}
              </Button>
            </>
          )}
          {phase === "review" && currentReview && (
            <>
              <Button variant="outline" onClick={handleReviewSkip} disabled={working}>
                Non, homonymes distincts
              </Button>
              <Button onClick={handleReviewMerge} disabled={working}>
                {working ? "Fusion..." : "Oui, fusionner"}
              </Button>
            </>
          )}
          {phase === "done" && <Button onClick={handleClose}>Fermer et actualiser</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
