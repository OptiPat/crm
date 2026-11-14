import { Fragment, useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlacementMontantField } from "@/components/pipe/PlacementMontantField";
import { SouscriptionDetailsFields } from "@/components/pipe/SouscriptionDetailsFields";
import { useSouscriptionHolderChoices } from "@/hooks/useSouscriptionHolderChoices";
import { STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS } from "@/lib/placement/stellium-box-placement-products";
import { inferTypeProduitFromStelliumProductLabel } from "@/lib/pipe/remuneration-type-produit";
import {
  newNouvelleSouscriptionDraft,
  type NouvelleSouscriptionDraft,
} from "@/lib/placement/nouvelle-souscription-inline";

interface NouvelleSouscriptionInlineFieldsProps {
  contactId: number;
  drafts: NouvelleSouscriptionDraft[];
  onChange: (drafts: NouvelleSouscriptionDraft[]) => void;
  disabled?: boolean;
}

/**
 * Souscriptions saisies directement sous l'acte « Nouvelle souscription » (création du Suivi) :
 * l'affaire enfant est créée avec elles, sans repasser par sa fiche.
 */
export function NouvelleSouscriptionInlineFields({
  contactId,
  drafts,
  onChange,
  disabled = false,
}: NouvelleSouscriptionInlineFieldsProps) {
  const holderChoices = useSouscriptionHolderChoices(contactId, null, contactId > 0);

  // Contact changé : le titulaire choisi appartenait à l'ancien contact (refusé à l'enregistrement).
  const previousContactRef = useRef(contactId);
  useEffect(() => {
    if (previousContactRef.current === contactId) return;
    previousContactRef.current = contactId;
    if (drafts.some((d) => d.holderKey != null)) {
      onChange(drafts.map((d) => ({ ...d, holderKey: null })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniquement au changement de contact
  }, [contactId]);

  const update = (key: string, patch: Partial<NouvelleSouscriptionDraft>) => {
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  if (contactId <= 0) {
    return (
      <p className="text-[11px] text-muted-foreground leading-snug">
        Choisissez d&apos;abord le contact pour saisir les souscriptions.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.map((draft, index) => {
        const typeProduit = draft.productLabel
          ? inferTypeProduitFromStelliumProductLabel(draft.productLabel)
          : null;
        return (
          <div key={draft.key} className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Souscription {index + 1}</p>
              {drafts.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label="Retirer cette souscription"
                  disabled={disabled}
                  onClick={() => onChange(drafts.filter((d) => d.key !== draft.key))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Produit</Label>
              <Select
                value={draft.productLabel}
                onValueChange={(productLabel) => update(draft.key, { productLabel })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner le produit…" />
                </SelectTrigger>
                <SelectContent className="max-h-[min(24rem,70vh)]">
                  {STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS.map((group, groupIndex) => (
                    <Fragment key={group.id}>
                      {groupIndex > 0 ? <SelectSeparator /> : null}
                      <SelectGroup>
                        <SelectLabel className="py-1 pl-8 pr-2 text-xs font-semibold text-muted-foreground">
                          {group.label}
                        </SelectLabel>
                        {group.items.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <PlacementMontantField
              value={draft.montantEuros}
              onChange={(montantEuros) => update(draft.key, { montantEuros })}
              disabled={disabled}
            />
            {draft.productLabel ? (
              <SouscriptionDetailsFields
                choices={holderChoices}
                holderKey={draft.holderKey}
                onHolderChange={(holderKey) => update(draft.key, { holderKey })}
                typeProduit={typeProduit}
                extras={draft.extras}
                onExtrasChange={(extras) => update(draft.key, { extras })}
                disabled={disabled}
                productLabel={draft.productLabel}
              />
            ) : null}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 text-xs"
        disabled={disabled}
        onClick={() => onChange([...drafts, newNouvelleSouscriptionDraft()])}
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter une souscription
      </Button>
    </div>
  );
}
