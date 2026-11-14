import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getInvestissementsByContact,
  getInvestissementsByFoyer,
  type Investissement,
} from "@/lib/api/tauri-investissements";
import { getContactById } from "@/lib/api/tauri-contacts";
import { buildPartenaireNomMap } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-partenaires";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { TYPE_LABEL_BY_VALUE } from "@/lib/investissements/product-target-filter";
import {
  contractLinkCandidates,
  defaultContractLinkId,
} from "@/lib/placement/placement-contract-link";

function formatContractOption(inv: Investissement): string {
  const type = TYPE_LABEL_BY_VALUE[inv.type_produit] ?? inv.type_produit;
  const numero = inv.numero_contrat?.trim();
  return `${inv.nom_produit}${numero ? ` — n° ${numero}` : ""} (${type})`;
}

interface PlacementContractSelectProps {
  contactId: number;
  productLabel: string;
  value: number | null;
  onChange: (investissementId: number | null) => void;
  /** `true` dès qu'au moins un contrat éligible existe : le choix devient obligatoire. */
  onRequiredChange?: (required: boolean) => void;
  disabled?: boolean;
}

/**
 * Contrat concerné par un acte reporté sur la fiche placement (versement complémentaire,
 * versements programmés, arbitrage libre). Pré-sélectionné quand il n'y a pas d'ambiguïté.
 */
export function PlacementContractSelect({
  contactId,
  productLabel,
  value,
  onChange,
  onRequiredChange,
  disabled = false,
}: PlacementContractSelectProps) {
  const [candidates, setCandidates] = useState<Investissement[] | null>(null);
  const [partenaireNoms, setPartenaireNoms] = useState<ReadonlyMap<number, string>>(new Map());

  useEffect(() => {
    if (contactId <= 0) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      // Contrats du client + contrats « Commun » de son foyer.
      void Promise.all([getInvestissementsByContact(contactId), getContactById(contactId)])
        .then(async ([own, contact]) => {
          const foyerRows =
            contact.foyer_id != null && contact.foyer_id > 0
              ? await getInvestissementsByFoyer(contact.foyer_id)
              : [];
          const byId = new Map<number, Investissement>();
          for (const inv of [...own, ...foyerRows]) byId.set(inv.id, inv);
          const list = contractLinkCandidates([...byId.values()]);
          const noms = await buildPartenaireNomMap(list);
          if (cancelled) return;
          setCandidates(list);
          setPartenaireNoms(noms);
        })
        .catch((err) => {
          console.error(err);
          if (!cancelled) setCandidates([]);
        });
    };
    load();
    const unsub = subscribeInvestissementsChanged(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [contactId]);

  const required = (candidates?.length ?? 0) > 0;
  useEffect(() => {
    onRequiredChange?.(required);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notifier uniquement au changement
  }, [required]);

  // Pré-sélection ; recalculée si le produit change ou si le contrat choisi n'est plus proposé.
  const previousProductRef = useRef(productLabel);
  useEffect(() => {
    if (!candidates) return;
    const productChanged = previousProductRef.current !== productLabel;
    previousProductRef.current = productLabel;
    if (!productChanged && value != null && candidates.some((inv) => inv.id === value)) return;
    const next = defaultContractLinkId(candidates, partenaireNoms, productLabel);
    if (next !== value) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcul sur liste / produit
  }, [candidates, partenaireNoms, productLabel]);

  if (candidates == null) {
    return <p className="text-xs text-muted-foreground">Chargement des contrats…</p>;
  }

  if (candidates.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground leading-snug">
        Aucun contrat assurance-vie, PER ou capitalisation actif sur la fiche du client : la fiche
        placement ne pourra pas être mise à jour automatiquement à la validation.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Contrat concerné *</Label>
      <Select
        value={value != null ? String(value) : ""}
        onValueChange={(v) => onChange(v ? Number(v) : null)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Sélectionner le contrat…" />
        </SelectTrigger>
        <SelectContent className="max-h-[min(24rem,70vh)]">
          {candidates.map((inv) => (
            <SelectItem key={inv.id} value={String(inv.id)}>
              {formatContractOption(inv)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground leading-snug">
        À la validation du partenaire, la fiche de ce contrat est mise à jour (versement, versement
        programmé ou dates d&apos;arbitrage).
      </p>
    </div>
  );
}
