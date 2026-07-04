import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadIdentityPreviewPages,
  type IdentityPreviewPage,
} from "@/lib/documents/identity-document-preview";
import type { IdentityExtractResult } from "@/lib/identity/parse-identity-document";
import { identityDateFrToIso } from "@/lib/identity/parse-identity-document";
import {
  resolveIdentityUserMessage,
  summarizeMrzTrust,
} from "@/lib/identity/identity-status-messages";
import { normalizeIdentityDate } from "@/lib/identity/visual-identity-parser";
import { contactHasStoredBirthPlace, contactHasStoredTimestamp } from "@/lib/identity/merge-identity-fields";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STACKED_NESTED_SHEET_Z } from "@/lib/ui/stacked-sheet-layers";

export type IdentityPreviewValues = {
  dateNaissanceFr: string;
  dateExpirationFr: string;
  lieuNaissance: string;
  nom: string;
  prenom: string;
};

type IdentityExtractPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extracted: IdentityExtractResult | null;
  onConfirm: (values: IdentityPreviewValues) => void;
  loading?: boolean;
  contactNom?: string;
  contactPrenom?: string;
  contactDateNaissance?: number;
  contactLieuNaissance?: string;
  rectoPreviewPath?: string;
  versoPreviewPath?: string;
  nestedSheet?: boolean;
};

function trustTone(extracted: IdentityExtractResult | null): string {
  if (extracted?.mrzVerified) {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }
  if (extracted?.mrz) {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }
  return "border-muted bg-muted/40 text-muted-foreground";
}

function IdentityDocumentPreviewPanel({
  open,
  rectoPath,
  versoPath,
  showLieuNaissanceField,
}: {
  open: boolean;
  rectoPath?: string;
  versoPath?: string;
  showLieuNaissanceField: boolean;
}) {
  const [pages, setPages] = useState<IdentityPreviewPage[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPages([]);
      return;
    }

    let cancelled = false;

    async function loadPreviews() {
      if (!rectoPath && !versoPath) return;

      setPreviewLoading(true);
      try {
        const loaded = await loadIdentityPreviewPages(rectoPath, versoPath);
        if (!cancelled) setPages(loaded);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }

    void loadPreviews();
    return () => {
      cancelled = true;
    };
  }, [open, rectoPath, versoPath]);

  if (!rectoPath && !versoPath) return null;

  return (
    <div className="flex min-h-0 flex-col gap-2 lg:max-h-[calc(90vh-11rem)]">
      <p className="text-xs text-muted-foreground">
        {showLieuNaissanceField
          ? "Faites défiler pour voir toutes les pages et recopier le lieu de naissance si besoin."
          : "Faites défiler pour voir toutes les pages du document."}
      </p>

      {previewLoading && (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Chargement de l&apos;aperçu…
        </div>
      )}

      {!previewLoading && pages.length > 0 && (
        <div className="min-h-[220px] flex-1 space-y-4 overflow-y-auto rounded-md border bg-muted/20 p-2">
          {pages.map((page, index) => (
            <figure key={`${page.label}-${index}`} className="space-y-1">
              <figcaption className="text-xs font-medium text-muted-foreground">
                {page.label}
              </figcaption>
              <img
                src={page.dataUrl}
                alt={page.label}
                className="w-full rounded-md border bg-muted/30 object-contain"
              />
            </figure>
          ))}
        </div>
      )}

      {!previewLoading && pages.length === 0 && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Aperçu indisponible — saisissez les champs manuellement.
        </div>
      )}
    </div>
  );
}

export function IdentityExtractPreviewDialog({
  open,
  onOpenChange,
  extracted,
  onConfirm,
  loading = false,
  contactNom,
  contactPrenom,
  contactDateNaissance,
  contactLieuNaissance,
  rectoPreviewPath,
  versoPreviewPath,
  nestedSheet = false,
}: IdentityExtractPreviewDialogProps) {
  const [dateNaissanceFr, setDateNaissanceFr] = useState("");
  const [dateExpirationFr, setDateExpirationFr] = useState("");
  const [lieuNaissance, setLieuNaissance] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");

  useEffect(() => {
    if (!extracted) return;
    setDateNaissanceFr(extracted.dateNaissanceFr ?? "");
    setDateExpirationFr(extracted.dateExpirationFr ?? "");
    setLieuNaissance(extracted.lieuNaissance ?? "");
    setNom(extracted.nom ?? "");
    setPrenom(extracted.prenom ?? "");
  }, [extracted]);

  const contactHasName = Boolean(contactNom?.trim() && contactPrenom?.trim());
  const showNameFields =
    !contactHasName && Boolean(nom || prenom || extracted?.nom || extracted?.prenom);
  const showDateNaissanceField = !contactHasStoredTimestamp(contactDateNaissance);
  const showLieuNaissanceField = !contactHasStoredBirthPlace(contactLieuNaissance);

  const hasSomethingToApply =
    (showDateNaissanceField && dateNaissanceFr.trim() !== "") ||
    dateExpirationFr.trim() !== "" ||
    (showLieuNaissanceField && lieuNaissance.trim() !== "") ||
    nom.trim() !== "" ||
    prenom.trim() !== "";

  const statusMessage = resolveIdentityUserMessage(extracted);
  const mrzTrust = summarizeMrzTrust(extracted);
  const hasPreview = Boolean(rectoPreviewPath || versoPreviewPath);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={!nestedSheet}>
      <DialogContent
        hideOverlay={nestedSheet}
        className={cn(
          "flex max-h-[90vh] max-w-5xl flex-col overflow-hidden",
          nestedSheet ? STACKED_NESTED_SHEET_Z : "z-[60]"
        )}
      >
        <DialogHeader>
          <DialogTitle>{getDocumentTypeLabel("IDENTITE")}</DialogTitle>
          <DialogDescription>
            {contactPrenom?.trim() && contactNom?.trim()
              ? `${contactPrenom} ${contactNom} — `
              : ""}
            Traitement local (aucun envoi réseau).
          </DialogDescription>
        </DialogHeader>

        <div
          className={
            hasPreview
              ? "grid min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-2 lg:items-stretch"
              : "space-y-4 overflow-y-auto"
          }
        >
          {hasPreview && (
            <IdentityDocumentPreviewPanel
              open={open}
              rectoPath={rectoPreviewPath}
              versoPath={versoPreviewPath}
              showLieuNaissanceField={showLieuNaissanceField}
            />
          )}

          <div className="space-y-4 overflow-y-auto lg:max-h-[calc(90vh-11rem)]">
            <div className={`rounded-md border px-3 py-2 text-sm ${trustTone(extracted)}`}>
              <p className="font-medium">{mrzTrust}</p>
              <p className="mt-1">{statusMessage}</p>
            </div>

            {extracted?.expiryMayBeExtended && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Ancienne CNI : la validité a peut-être été prolongée de 5 ans (non
                imprimé sur la carte). Vérifiez la date de fin de validité auprès du
                titulaire avant d&apos;appliquer.
              </div>
            )}

            {showNameFields && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="identity-nom">Nom</Label>
                  <Input id="identity-nom" value={nom} onChange={(e) => setNom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="identity-prenom">Prénom</Label>
                  <Input
                    id="identity-prenom"
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div
              className={`grid gap-4 ${
                showDateNaissanceField || showLieuNaissanceField ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {showDateNaissanceField && (
                <div className="space-y-2">
                  <Label htmlFor="identity-date">Date de naissance</Label>
                  <Input
                    id="identity-date"
                    placeholder="jj/mm/aaaa"
                    value={dateNaissanceFr}
                    onChange={(e) => setDateNaissanceFr(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="identity-expiry">Fin de validité (document)</Label>
                <Input
                  id="identity-expiry"
                  placeholder="jj/mm/aaaa"
                  value={dateExpirationFr}
                  onChange={(e) => setDateExpirationFr(e.target.value)}
                />
              </div>
              {showLieuNaissanceField && (
                <div className={`space-y-2 ${showDateNaissanceField ? "" : "col-span-2"}`}>
                  <Label htmlFor="identity-lieu">Lieu de naissance</Label>
                  <Input
                    id="identity-lieu"
                    value={lieuNaissance}
                    onChange={(e) => setLieuNaissance(e.target.value)}
                    placeholder="Ville"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={loading || !hasSomethingToApply}
            onClick={() => {
              const normalizedBirth = showDateNaissanceField
                ? normalizeIdentityDate(dateNaissanceFr.trim())
                : "";
              const normalizedExpiry = normalizeIdentityDate(dateExpirationFr.trim());

              if (showDateNaissanceField && dateNaissanceFr.trim() && !normalizedBirth) {
                toast.error("Date de naissance invalide (format jj/mm/aaaa).");
                return;
              }
              if (normalizedBirth && !identityDateFrToIso(normalizedBirth)) {
                toast.error("Date de naissance invalide.");
                return;
              }
              if (dateExpirationFr.trim() && !normalizedExpiry) {
                toast.error("Date de fin de validité invalide (format jj/mm/aaaa).");
                return;
              }
              if (normalizedExpiry && !identityDateFrToIso(normalizedExpiry)) {
                toast.error("Date de fin de validité invalide.");
                return;
              }
              onConfirm({
                dateNaissanceFr: showDateNaissanceField
                  ? normalizedBirth ?? dateNaissanceFr.trim()
                  : "",
                dateExpirationFr: normalizedExpiry ?? dateExpirationFr.trim(),
                lieuNaissance: showLieuNaissanceField ? lieuNaissance.trim() : "",
                nom: nom.trim(),
                prenom: prenom.trim(),
              });
            }}
          >
            {loading ? "Application…" : "Appliquer à la fiche"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
