import { FileDown } from "lucide-react";
import { CP } from "./client-preview-theme";

export function ClientPreviewPdfButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={CP.rdvButton}
      disabled={disabled}
      onClick={onClick}
    >
      <FileDown className="h-4 w-4" aria-hidden />
      Télécharger le PDF
    </button>
  );
}
