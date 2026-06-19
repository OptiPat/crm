import { useState, useEffect } from "react";
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
  Users,
  TrendingUp,
  Target,
  FileText,
  Edit,
  Trash2,
  Coins,
  Wallet,
  ChevronRight,
  X,
} from "lucide-react";
import {
  getFoyerTypeBadgeClass,
  getFoyerTypeLabel,
} from "@/lib/foyers/foyer-display";
import { ContactInitialsAvatar } from "@/components/contacts/contacts-ui";
import { cn } from "@/lib/utils";
import { type Foyer } from "@/lib/api/tauri-foyers";
import { FoyerForm } from "./FoyerForm";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import {
  formatFoyerMemberLabel,
  getContactsForFoyer,
  loadFoyerInvestissements,
  type FoyerInvestissement,
} from "@/lib/foyers/foyer-utils";
import { InvestissementForm } from "@/components/investissements/InvestissementForm";
import { InvestissementEncoursDialog } from "@/components/investissements/InvestissementEncoursDialog";
import { InvestissementCard } from "@/components/investissements/InvestissementCard";
import { getAllPartenaires, type Partenaire } from "@/lib/api/tauri-partenaires";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { isPlacementEncoursEligible } from "@/lib/investissements/investissement-encours";
import type { Investissement } from "@/lib/api/tauri-investissements";

interface FoyerDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foyer: Foyer | null;
  onDelete: (id: number) => void;
  onUpdate: () => void;
  onMemberClick?: (contact: Contact) => void;
  embedded?: boolean;
}

export function FoyerDetail({
  open,
  onOpenChange,
  foyer,
  onDelete,
  onUpdate,
  onMemberClick,
  embedded = false,
}: FoyerDetailProps) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [showInvestissementForm, setShowInvestissementForm] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<FoyerInvestissement[]>([]);
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [encoursInvestissement, setEncoursInvestissement] =
    useState<Investissement | null>(null);

  const detailActive = embedded || open;

  useEffect(() => {
    if (foyer?.id && detailActive) {
      loadFoyerData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharge sur changement d'id de foyer / activation
  }, [foyer?.id, detailActive]);

  const loadFoyerData = async () => {
    if (!foyer?.id) return;

    setLoadingData(true);
    try {
      const [allContacts, partenairesData] = await Promise.all([
        getAllContacts(),
        getAllPartenaires(),
      ]);
      const membres = getContactsForFoyer(allContacts, foyer.id);
      setContacts(membres);
      setPartenaires(partenairesData);
      setInvestissements(
        await loadFoyerInvestissements(foyer.id, membres)
      );
    } catch (error) {
      console.error("Error loading foyer data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  // Calculer le total patrimoine du foyer (investissements communs uniquement)
  const totalPatrimoineFoyer = investissements.reduce(
    (total, inv) => total + (inv.montant_initial || 0),
    0
  );

  const getPartenaireNom = (partenaireId?: number): string | null => {
    if (!partenaireId) return null;
    return partenaires.find((p) => p.id === partenaireId)?.raison_sociale ?? null;
  };

  if (!foyer) return null;

  const handleDeleteConfirm = () => {
    if (!foyer) return;
    onDelete(foyer.id);
    setShowDeleteDialog(false);
    onOpenChange(false);
  };

  const formatCurrency = (value?: number) => {
    if (!value) return "Non renseigné";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const headerBlock = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {embedded ? (
          <h2 className="text-xl font-serif font-bold text-primary leading-tight truncate">
            {foyer.nom}
          </h2>
        ) : (
          <DialogTitle className="text-2xl">{foyer.nom}</DialogTitle>
        )}
        {!embedded && (
          <DialogDescription className="sr-only">
            Détails du foyer fiscal et patrimoine associé
          </DialogDescription>
        )}
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge
            className={cn("border", getFoyerTypeBadgeClass(foyer.type_foyer))}
          >
            {getFoyerTypeLabel(foyer.type_foyer)}
          </Badge>
          {foyer.tranche_imposition && (
            <Badge variant="outline">TMI {foyer.tranche_imposition}</Badge>
          )}
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
            {/* Informations fiscales */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Coins className="h-5 w-5" />
                  Informations fiscales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Parts fiscales
                    </div>
                    <div className="text-lg font-semibold">
                      {foyer.nombre_parts_fiscales || "Non renseigné"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Tranche marginale d'imposition
                    </div>
                    <div className="text-lg font-semibold">
                      {foyer.tranche_imposition || "Non renseigné"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Revenu brut global
                    </div>
                    <div className="text-lg font-semibold">
                      {formatCurrency(foyer.revenu_fiscal_reference)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      IR net à payer
                    </div>
                    <div className="text-lg font-semibold">
                      {formatCurrency(foyer.ir_net_a_payer)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Situation patrimoniale */}
            {foyer.situation_patrimoniale && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Situation patrimoniale
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">
                    {foyer.situation_patrimoniale}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Objectifs patrimoniaux */}
            {foyer.objectifs_patrimoniaux && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Objectifs patrimoniaux
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">
                    {foyer.objectifs_patrimoniaux}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Membres du foyer */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Membres du foyer ({contacts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingData ? (
                  <p className="text-sm text-muted-foreground">Chargement…</p>
                ) : contacts.length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    Aucun contact rattaché à ce foyer. Associez des contacts depuis
                    leur fiche (section Foyer) ou via Contacts → Afficher par foyer.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {onMemberClick && (
                      <p className="text-xs text-muted-foreground mb-2">
                        Cliquez sur un membre pour ouvrir sa fiche contact.
                      </p>
                    )}
                    {contacts.map((contact) => {
                      const inner = (
                        <>
                          <ContactInitialsAvatar
                            prenom={contact.prenom}
                            nom={contact.nom}
                            className="h-9 w-9"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">
                              {formatFoyerMemberLabel(
                                contact,
                                contact.role_foyer
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {contact.email || contact.telephone || "—"}
                            </div>
                          </div>
                          {onMemberClick && (
                            <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                          )}
                        </>
                      );
                      return onMemberClick ? (
                        <button
                          key={contact.id}
                          type="button"
                          className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 hover:border-primary/25 transition-colors text-left group"
                          onClick={() => onMemberClick(contact)}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div
                          key={contact.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50"
                        >
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Investissements du foyer */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      Patrimoine du foyer
                    </CardTitle>
                    <div className="text-xl font-bold text-primary">
                      {formatEuroCentimes(totalPatrimoineFoyer)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowInvestissementForm(true)}
                  >
                    Ajouter un investissement
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingData ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Chargement des investissements...
                  </div>
                ) : investissements.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Aucun investissement pour ce foyer (ni commun ni rattaché aux
                    membres)
                  </div>
                ) : (
                  <div className="space-y-3">
                    {investissements.map((inv) => (
                      <InvestissementCard
                        key={inv.id}
                        inv={inv}
                        partenaireNom={getPartenaireNom(inv.partenaire_id)}
                        proprietaireLabel={inv.proprietaireLabel}
                        proprietaireVariant={
                          inv.proprietaireLabel === "Commun (foyer)"
                            ? "foyer"
                            : "member"
                        }
                        actions={
                          isPlacementEncoursEligible(inv.type_produit) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-amber-700 hover:text-amber-800"
                              onClick={() => setEncoursInvestissement(inv)}
                              title="Mettre à jour l'encours"
                              aria-label="Encours"
                            >
                              <TrendingUp className="h-4 w-4" />
                            </Button>
                          ) : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            {foyer.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{foyer.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Métadonnées */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informations système</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <div>
                  Créé le:{" "}
                  {new Date(foyer.created_at * 1000).toLocaleString("fr-FR")}
                </div>
                <div>
                  Mis à jour le:{" "}
                  {new Date(foyer.updated_at * 1000).toLocaleString("fr-FR")}
                </div>
              </CardContent>
            </Card>
          </div>
  );

  const modals = (
    <>
      {/* Formulaire de modification */}
      <FoyerForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        foyer={foyer}
        onSuccess={() => {
          onUpdate();
          setShowEditForm(false);
        }}
      />

      {/* Formulaire d'ajout d'investissement */}
      {foyer && (
        <InvestissementForm
          open={showInvestissementForm}
          onOpenChange={setShowInvestissementForm}
          investissement={null}
          defaultContactId={contacts.length > 0 ? contacts[0]?.id : undefined}
          defaultFoyerId={foyer.id}
          onSuccess={() => {
            loadFoyerData();
            setShowInvestissementForm(false);
          }}
          onEncoursUpdated={loadFoyerData}
        />
      )}

      <InvestissementEncoursDialog
        open={encoursInvestissement != null}
        onOpenChange={(open) => {
          if (!open) setEncoursInvestissement(null);
        }}
        investissement={encoursInvestissement}
        onUpdated={loadFoyerData}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce foyer ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le foyer « {foyer?.nom} » sera supprimé. Les contacts ne seront
              pas supprimés, seulement détachés du foyer.
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
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <div className="shrink-0 border-b border-border/60 px-4 py-3">
            {headerBlock}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{bodyBlock}</div>
        </div>
        {modals}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto shadow-md flex flex-col">
          <DialogHeader className="pr-12 shrink-0">{headerBlock}</DialogHeader>
          <div className="min-h-0">{bodyBlock}</div>
        </DialogContent>
      </Dialog>
      {modals}
    </>
  );
}
