import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Edit,
  Trash2,
  Mail,
  FileText,
  Wallet,
  X,
} from "lucide-react";
import { type Partenaire } from "@/lib/api/tauri-partenaires";
import { getAllInvestissements, type Investissement } from "@/lib/api/tauri-investissements";
import { getPartenaireTypeInfo } from "@/lib/partenaires/partenaire-display";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { InvestissementCard } from "@/components/investissements/InvestissementCard";
import { PartenaireForm } from "./PartenaireForm";
import { cn } from "@/lib/utils";

interface PartenaireDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partenaire: Partenaire | null;
  onDelete: (id: number) => void;
  onUpdate: () => void;
  embedded?: boolean;
  onOpenContact?: (contactId: number) => void;
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | undefined | null;
}) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}

export function PartenaireDetail({
  open,
  onOpenChange,
  partenaire,
  onDelete,
  onUpdate,
  embedded = false,
  onOpenContact,
}: PartenaireDetailProps) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);

  const detailActive = embedded || open;

  useEffect(() => {
    if (!partenaire?.id || !detailActive) return;
    let cancelled = false;
    setLoadingInv(true);
    void (async () => {
      try {
        const all = await getAllInvestissements();
        if (cancelled) return;
        setInvestissements(
          all.filter((inv) => inv.partenaire_id === partenaire.id)
        );
      } catch (e) {
        console.error("Error loading partenaire investissements:", e);
        if (!cancelled) setInvestissements([]);
      } finally {
        if (!cancelled) setLoadingInv(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partenaire?.id, detailActive]);

  if (!partenaire) return null;

  const typeInfo = getPartenaireTypeInfo(partenaire.type_partenaire);
  const TypeIcon = typeInfo.icon;

  const patrimoineAvecMoi = investissements
    .filter((i) => i.origine === "MON_CONSEIL")
    .reduce((s, i) => s + (i.montant_initial || 0), 0);

  const handleDeleteConfirm = () => {
    onDelete(partenaire.id);
    setShowDeleteDialog(false);
    onOpenChange(false);
  };

  const headerBlock = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div
          className={cn(
            "p-2.5 rounded-xl border bg-gradient-to-br shrink-0",
            typeInfo.accentClass
          )}
        >
          <TypeIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          {embedded ? (
            <h2 className="text-xl font-serif font-bold text-primary leading-tight truncate">
              {partenaire.raison_sociale}
            </h2>
          ) : (
            <DialogTitle className="text-xl pr-2">{partenaire.raison_sociale}</DialogTitle>
          )}
          {!embedded && (
            <DialogDescription className="sr-only">
              Fiche partenaire professionnel
            </DialogDescription>
          )}
          <Badge className={cn("mt-2 border", typeInfo.badgeClass)}>
            {typeInfo.label}
          </Badge>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowEditForm(true)}
          title="Modifier"
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowDeleteDialog(true)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          title="Supprimer"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        {embedded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            title="Fermer"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  const bodyBlock = (
    <div className="space-y-4">
      {(partenaire.nom_contact ||
        partenaire.email ||
        partenaire.telephone ||
        partenaire.adresse) && (
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Coordonnées</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <DetailField
              label="Contact"
              value={[partenaire.prenom_contact, partenaire.nom_contact]
                .filter(Boolean)
                .join(" ")}
            />
            <DetailField label="E-mail" value={partenaire.email} />
            <DetailField label="Téléphone" value={partenaire.telephone} />
            <DetailField
              label="Adresse"
              value={
                partenaire.adresse
                  ? [
                      partenaire.adresse,
                      [partenaire.code_postal, partenaire.ville]
                        .filter(Boolean)
                        .join(" "),
                    ]
                      .filter(Boolean)
                      .join(", ")
                  : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {(partenaire.specialite ||
        partenaire.zone_geo ||
        partenaire.niveau_collaboration) && (
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Collaboration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Spécialité" value={partenaire.specialite} />
            <DetailField label="Zone géographique" value={partenaire.zone_geo} />
            <DetailField
              label="Niveau de collaboration"
              value={partenaire.niveau_collaboration}
            />
          </CardContent>
        </Card>
      )}

      {partenaire.notes && (
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{partenaire.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Produits liés
            </CardTitle>
            {patrimoineAvecMoi > 0 && (
              <span className="text-sm font-semibold text-primary tabular-nums">
                {formatEuroCentimes(patrimoineAvecMoi)}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingInv ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : investissements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun investissement client n&apos;est rattaché à ce partenaire pour le moment.
            </p>
          ) : (
            <div className="space-y-3">
              {investissements.map((inv) => (
                <InvestissementCard
                  key={inv.id}
                  inv={inv}
                  partenaireNom={partenaire.raison_sociale}
                  onOpenContactClick={
                    onOpenContact && inv.contact_id
                      ? () => onOpenContact(inv.contact_id!)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-muted-foreground font-normal">
            Informations système
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>
            Créé le{" "}
            {new Date(partenaire.created_at * 1000).toLocaleString("fr-FR")}
          </p>
          <p>
            Mis à jour le{" "}
            {new Date(partenaire.updated_at * 1000).toLocaleString("fr-FR")}
          </p>
        </CardContent>
      </Card>

      {!embedded && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Mail className="h-3.5 w-3.5" />
          La modification rapide ne couvre que le nom et le type ; les autres champs
          restent en base si déjà renseignés.
        </p>
      )}
    </div>
  );

  const modals = (
    <>
      <PartenaireForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        partenaire={partenaire}
        onSuccess={() => {
          onUpdate();
          setShowEditForm(false);
        }}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce partenaire ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {partenaire.raison_sociale} » sera supprimé. Les investissements clients
              conservent leurs données mais perdront le lien vers ce partenaire.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) {
    return (
      <>
        <div className="flex flex-col h-full min-h-[420px] max-h-[calc(100vh-10rem)] rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">
          <div className="shrink-0 border-b border-border/60 px-4 py-3">
            {headerBlock}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">{bodyBlock}</div>
        </div>
        {modals}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto shadow-md">
          <DialogHeader className="shrink-0">{headerBlock}</DialogHeader>
          {bodyBlock}
        </DialogContent>
      </Dialog>
      {modals}
    </>
  );
}
