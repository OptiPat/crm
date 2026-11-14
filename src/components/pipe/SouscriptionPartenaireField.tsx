import { useEffect, useId, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllPartenaires, type Partenaire } from "@/lib/api/tauri-partenaires";
import { subscribePartenairesChanged } from "@/lib/partenaires/partenaire-events";
import { loadNomProduitInvestissements } from "@/lib/investissements/use-nom-produit-investissements";
import { guessPartenaireIdForProduct } from "@/lib/placement/partenaire-guess";

const NONE = "__none__";

interface SouscriptionPartenaireFieldProps {
  productLabel: string;
  value: number | null;
  onChange: (partenaireId: number | null) => void;
  disabled?: boolean;
}

/** Partenaire de la souscription (repris sur le placement), deviné depuis le produit. */
export function SouscriptionPartenaireField({
  productLabel,
  value,
  onChange,
  disabled = false,
}: SouscriptionPartenaireFieldProps) {
  const id = useId();
  const [partenaires, setPartenaires] = useState<Partenaire[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getAllPartenaires()
        .then((rows) => {
          if (!cancelled) {
            setPartenaires(
              [...rows].sort((a, b) => a.raison_sociale.localeCompare(b.raison_sociale, "fr"))
            );
          }
        })
        .catch((err) => {
          console.error(err);
          if (!cancelled) setPartenaires([]);
        });
    };
    load();
    const unsub = subscribePartenairesChanged(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Pré-remplissage : à l'ouverture si vide, puis à chaque changement de produit.
  const guessedForRef = useRef<string | null>(value != null ? productLabel : null);
  useEffect(() => {
    if (!partenaires || !productLabel.trim()) return;
    if (guessedForRef.current === productLabel) return;
    // 1ʳᵉ fois : ne pas écraser un partenaire déjà enregistré (modification d'une souscription).
    const productChanged = guessedForRef.current !== null;
    guessedForRef.current = productLabel;
    if (!productChanged && value != null) return;
    let cancelled = false;
    void loadNomProduitInvestissements()
      .catch(() => [])
      .then((investissements) => {
        if (cancelled) return;
        const guess = guessPartenaireIdForProduct(productLabel, partenaires, investissements);
        // Produit changé sans partenaire évident : ne pas garder celui de l'ancien produit.
        const next = guess ?? (productChanged ? null : value);
        if (next !== value) onChange(next);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deviner une fois par produit
  }, [partenaires, productLabel]);

  // Partenaire supprimé depuis : le retirer plutôt que d'afficher une sélection vide.
  useEffect(() => {
    if (partenaires && value != null && !partenaires.some((p) => p.id === value)) onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- à la (re)charge de la liste
  }, [partenaires, value]);

  if (partenaires == null) return null;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Partenaire</Label>
      <Select
        value={value != null ? String(value) : NONE}
        onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Sélectionner le partenaire…" />
        </SelectTrigger>
        <SelectContent className="max-h-[min(24rem,70vh)]">
          <SelectItem value={NONE}>Non renseigné</SelectItem>
          {partenaires.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.raison_sociale}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {partenaires.length === 0 ? (
        <p className="text-[11px] text-muted-foreground leading-snug">
          Aucun partenaire enregistré : ajoutez-le dans Partenaires pour le relier au placement.
        </p>
      ) : null}
    </div>
  );
}
