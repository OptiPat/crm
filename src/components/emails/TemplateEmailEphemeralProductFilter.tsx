import { TypeProduitConditionFields } from "@/components/etiquettes/TypeProduitConditionFields";
import type { EphemeralProduitsMatchMode } from "@/lib/emails/template-email-ephemeral";

type Props = {
  types: string[];
  nomsProduit: string[];
  produitsMatchMode: EphemeralProduitsMatchMode;
  onTypesChange: (next: string[]) => void;
  onNomsProduitChange: (next: string[]) => void;
  onProduitsMatchModeChange: (mode: EphemeralProduitsMatchMode) => void;
  highlightInvalid?: boolean;
};

export function TemplateEmailEphemeralProductFilter({
  types,
  nomsProduit,
  produitsMatchMode,
  onTypesChange,
  onNomsProduitChange,
  onProduitsMatchModeChange,
  highlightInvalid,
}: Props) {
  return (
    <TypeProduitConditionFields
      variant="card"
      showEmptyWarning
      types={types}
      nomsProduit={nomsProduit}
      produitsMatchMode={produitsMatchMode}
      onTypesChange={onTypesChange}
      onNomsProduitChange={onNomsProduitChange}
      onProduitsMatchModeChange={onProduitsMatchModeChange}
      highlightInvalid={highlightInvalid}
    />
  );
}
