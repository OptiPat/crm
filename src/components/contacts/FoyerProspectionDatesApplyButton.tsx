import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  getProspectionDatePropagationTargets,
  hasAnyProspectionDates,
  propagateProspectionDatesToRelatedContacts,
  type ProspectionDatesFields,
} from "@/lib/foyers/foyer-prospection-dates-sync";

interface FoyerProspectionDatesApplyButtonProps {
  contactId: number;
  foyerId?: number | null;
  /** Membres pré-chargés du foyer (optionnel). */
  foyerMembers?: Contact[];
  dates: ProspectionDatesFields;
  onApplied?: () => void;
  compact?: boolean;
}

function formatMemberNames(contacts: Contact[]): string {
  return contacts
    .map((c) => `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || "Contact")
    .join(", ");
}

export function FoyerProspectionDatesApplyButton({
  contactId,
  foyerId,
  foyerMembers = [],
  dates,
  onApplied,
  compact = false,
}: FoyerProspectionDatesApplyButtonProps) {
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<Contact[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getProspectionDatePropagationTargets({
      contactId,
      foyerId,
      preloadedFoyerMembers: foyerMembers,
    })
      .then((loaded) => {
        if (!cancelled) setTargets(loaded);
      })
      .catch(() => {
        if (!cancelled) setTargets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, foyerId, foyerMembers]);

  const hasDates = hasAnyProspectionDates(dates);

  if (targets.length === 0) {
    return null;
  }

  const handleApply = async () => {
    if (!hasDates) {
      toast.info("Renseignez au moins la date R1 ou le dernier contact");
      return;
    }
    setLoading(true);
    try {
      const updated = await propagateProspectionDatesToRelatedContacts({
        contactId,
        foyerId,
        dates,
        preloadedFoyerMembers: foyerMembers,
      });
      if (updated.length === 0) {
        toast.info("Aucun conjoint ou membre du foyer à mettre à jour");
        return;
      }
      toast.success(`Dates appliquées à ${formatMemberNames(updated)}`);
      onApplied?.();
    } catch (error) {
      toast.error(
        "Impossible d'appliquer les dates au conjoint / foyer : " + String(error)
      );
    } finally {
      setLoading(false);
    }
  };

  const label = compact
    ? "Appliquer au conjoint / foyer"
    : `Appliquer au conjoint / foyer (${targets.length})`;

  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "outline"}
      size="sm"
      className={
        compact
          ? "h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          : "h-8 gap-1.5 text-xs"
      }
      disabled={loading || !hasDates}
      title={
        hasDates
          ? `Copier R1 et dernier contact vers ${formatMemberNames(targets)}`
          : "Renseignez au moins une date avant d'appliquer"
      }
      onClick={() => void handleApply()}
    >
      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </Button>
  );
}
