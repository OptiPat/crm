import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getAllFoyers } from "@/lib/api/tauri-foyers";
import { getAllPartenaires } from "@/lib/api/tauri-partenaires";
import {
  createInvestissement,
  updateInvestissement,
  type Investissement,
  type NewInvestissement,
} from "@/lib/api/tauri-investissements";

interface InvestissementFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  investissement?: Investissement | null;
  defaultContactId?: number;
  defaultFoyerId?: number;
}

export function InvestissementForm({
  open,
  onOpenChange,
  onSuccess,
  investissement,
  defaultContactId,
  defaultFoyerId,
}: InvestissementFormProps) {
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [foyers, setFoyers] = useState<any[]>([]);
  const [partenaires, setPartenaires] = useState<any[]>([]);

  // Form state
  const [contactId, setContactId] = useState<string>("");
  const [investissementCommun, setInvestissementCommun] = useState(false);
  const [foyerId, setFoyerId] = useState<string>("");
  const [typeProduit, setTypeProduit] = useState<string>("");
  const [partenaireId, setPartenaireId] = useState<string>("");
  const [nomProduit, setNomProduit] = useState("");
  const [montantInitial, setMontantInitial] = useState("");
  const [dateSouscription, setDateSouscription] = useState("");
  const [dateFinDemembrement, setDateFinDemembrement] = useState("");
  const [versementProgramme, setVersementProgramme] = useState(false);
  const [montantVersementProgramme, setMontantVersementProgramme] = useState("");
  const [frequenceVersement, setFrequenceVersement] = useState<string>("");
  const [reinvestissementDividendes, setReinvestissementDividendes] = useState(false);
  const [pourcentageReinvestissement, setPourcentageReinvestissement] = useState("100");
  const [notes, setNotes] = useState("");

  // Produits acceptant le versement programmé
  const accepteVersementProgramme = [
    "ASSURANCE_VIE", 
    "CONTRAT_CAPITALISATION",
    "PER", 
    "EPARGNE_SALARIALE",
    "SCPI"
  ].includes(typeProduit);
  
  // SCPI accepte le réinvestissement des dividendes
  const accepteReinvestissement = ["SCPI", "SCPI_FISCALE"].includes(typeProduit);

  // Réinitialiser les champs incompatibles quand on change de type de produit
  useEffect(() => {
    if (!accepteVersementProgramme) {
      setVersementProgramme(false);
      setMontantVersementProgramme("");
      setFrequenceVersement("");
    }
    if (!accepteReinvestissement) {
      setReinvestissementDividendes(false);
      setPourcentageReinvestissement("100");
    }
  }, [typeProduit, accepteVersementProgramme, accepteReinvestissement]);

  useEffect(() => {
    if (open) {
      loadData();
      if (investissement) {
        // Pré-remplir le formulaire pour modification
        setContactId(investissement.contact_id?.toString() || "");
        setInvestissementCommun(!!investissement.foyer_id);
        setFoyerId(investissement.foyer_id?.toString() || "");
        setTypeProduit(investissement.type_produit);
        setPartenaireId(investissement.partenaire_id?.toString() || "");
        setNomProduit(investissement.nom_produit);
        setMontantInitial(investissement.montant_initial ? (investissement.montant_initial / 100).toString() : "");
        setDateSouscription(investissement.date_souscription ? new Date(investissement.date_souscription * 1000).toISOString().split('T')[0] : "");
        setDateFinDemembrement(investissement.date_fin_demembrement ? new Date(investissement.date_fin_demembrement * 1000).toISOString().split('T')[0] : "");
        setVersementProgramme(investissement.versement_programme);
        setMontantVersementProgramme(investissement.montant_versement_programme ? (investissement.montant_versement_programme / 100).toString() : "");
        setFrequenceVersement(investissement.frequence_versement || "");
        setReinvestissementDividendes(investissement.reinvestissement_dividendes);
        setPourcentageReinvestissement(investissement.notes?.match(/Réinv\. (\d+)%/)?.[1] || "100");
        setNotes(investissement.notes || "");
      } else {
        resetForm();
        // Si un contact par défaut est fourni, le pré-sélectionner
        if (defaultContactId) {
          setContactId(defaultContactId.toString());
        }
        // Si un foyer par défaut est fourni, le pré-sélectionner
        if (defaultFoyerId) {
          setInvestissementCommun(true);
          setFoyerId(defaultFoyerId.toString());
        }
      }
    }
  }, [open, investissement, defaultContactId, defaultFoyerId]);

  const loadData = async () => {
    try {
      const [contactsData, foyersData, partenairesData] = await Promise.all([
        getAllContacts(),
        getAllFoyers(),
        getAllPartenaires(),
      ]);
      setContacts(contactsData);
      setFoyers(foyersData);
      setPartenaires(partenairesData);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const resetForm = () => {
    setContactId("");
    setInvestissementCommun(false);
    setFoyerId("");
    setTypeProduit("");
    setPartenaireId("");
    setNomProduit("");
    setMontantInitial("");
    setDateSouscription("");
    setDateFinDemembrement("");
    setVersementProgramme(false);
    setMontantVersementProgramme("");
    setFrequenceVersement("");
    setReinvestissementDividendes(false);
    setPourcentageReinvestissement("100");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contactId || !typeProduit || !nomProduit) {
      alert("Veuillez remplir tous les champs obligatoires");
      return;
    }

    setLoading(true);

    try {
      // Stocker le pourcentage dans les notes si réinvestissement activé
      let finalNotes = notes || "";
      if (reinvestissementDividendes && accepteReinvestissement) {
        const pourcentageInfo = `Réinv. ${pourcentageReinvestissement}%`;
        finalNotes = finalNotes ? `${pourcentageInfo}\n${finalNotes}` : pourcentageInfo;
      }

      const newInvestissement: NewInvestissement = {
        contact_id: parseInt(contactId),
        foyer_id: investissementCommun && foyerId ? parseInt(foyerId) : undefined,
        type_produit: typeProduit,
        partenaire_id: partenaireId ? parseInt(partenaireId) : undefined,
        nom_produit: nomProduit,
        montant_initial: montantInitial ? Math.round(parseFloat(montantInitial) * 100) : undefined,
        date_souscription: dateSouscription ? new Date(dateSouscription).toISOString() : undefined,
        date_fin_demembrement: dateFinDemembrement ? new Date(dateFinDemembrement).toISOString() : undefined,
        versement_programme: accepteVersementProgramme ? versementProgramme : false,
        montant_versement_programme: montantVersementProgramme ? Math.round(parseFloat(montantVersementProgramme) * 100) : undefined,
        frequence_versement: frequenceVersement || undefined,
        reinvestissement_dividendes: accepteReinvestissement ? reinvestissementDividendes : false,
        notes: finalNotes || undefined,
      };

      if (investissement) {
        await updateInvestissement(investissement.id, newInvestissement);
      } else {
        await createInvestissement(newInvestissement);
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving investissement:", error);
      alert("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {investissement ? "Modifier l'investissement" : "Nouvel investissement"}
          </DialogTitle>
          <DialogDescription>
            {investissement
              ? "Modifiez les informations de l'investissement"
              : "Ajoutez un nouvel investissement pour un client"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Client */}
          <div className="space-y-2">
            <Label htmlFor="contact">
              Client <span className="text-red-500">*</span>
            </Label>
            <Select value={contactId} onValueChange={setContactId} required>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez un client" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id!.toString()}>
                    {contact.prenom} {contact.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Investissement commun */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="investissement-commun"
              checked={investissementCommun}
              onChange={(e) => setInvestissementCommun(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="investissement-commun">Investissement commun (foyer)</Label>
          </div>

          {/* Foyer (si investissement commun) */}
          {investissementCommun && (
            <div className="space-y-2">
              <Label htmlFor="foyer">Foyer</Label>
              <Select value={foyerId} onValueChange={setFoyerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un foyer" />
                </SelectTrigger>
                <SelectContent>
                  {foyers.map((foyer) => (
                    <SelectItem key={foyer.id} value={foyer.id.toString()}>
                      {foyer.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Type de produit */}
          <div className="space-y-2">
            <Label htmlFor="type-produit">
              Type de produit <span className="text-red-500">*</span>
            </Label>
            <Select value={typeProduit} onValueChange={setTypeProduit} required>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez un type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-xs font-semibold text-muted-foreground">Immobilier</SelectLabel>
                  <SelectItem value="PINEL">Pinel</SelectItem>
                  <SelectItem value="DENORMANDIE">Denormandie</SelectItem>
                  <SelectItem value="MALRAUX">Malraux</SelectItem>
                  <SelectItem value="MONUMENT_HISTORIQUE">Monument Historique</SelectItem>
                  <SelectItem value="DEFICIT_FONCIER">Déficit Foncier</SelectItem>
                  <SelectItem value="LMNP">LMNP</SelectItem>
                  <SelectItem value="LMP">LMP</SelectItem>
                  <SelectItem value="NUE_PROPRIETE">Nue-Propriété</SelectItem>
                  <SelectItem value="RESIDENCE_PRINCIPALE">Résidence Principale</SelectItem>
                  <SelectItem value="LOCATIF_CLASSIQUE">Locatif Classique</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs font-semibold text-muted-foreground">SCPI</SelectLabel>
                  <SelectItem value="SCPI">SCPI</SelectItem>
                  <SelectItem value="SCPI_DEMEMBREMENT">SCPI Démembrement</SelectItem>
                  <SelectItem value="SCPI_FISCALE">SCPI Fiscale</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs font-semibold text-muted-foreground">Placements</SelectLabel>
                  <SelectItem value="ASSURANCE_VIE">Assurance Vie</SelectItem>
                  <SelectItem value="CONTRAT_CAPITALISATION">Contrat de Capitalisation</SelectItem>
                  <SelectItem value="PER">PER</SelectItem>
                  <SelectItem value="EPARGNE_SALARIALE">Épargne Salariale</SelectItem>
                  <SelectItem value="FIP_FCPI">FIP/FCPI</SelectItem>
                  <SelectItem value="FCPR">FCPR</SelectItem>
                  <SelectItem value="G3F">G3F</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs font-semibold text-muted-foreground">Autre</SelectLabel>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                  <SelectItem value="IMMOBILIER">Immobilier (ancien)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Partenaire */}
          <div className="space-y-2">
            <Label htmlFor="partenaire">Partenaire</Label>
            <Select value={partenaireId} onValueChange={setPartenaireId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez un partenaire (optionnel)" />
              </SelectTrigger>
              <SelectContent>
                {partenaires.map((partenaire) => (
                  <SelectItem key={partenaire.id} value={partenaire.id.toString()}>
                    {partenaire.raison_sociale}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Nom du produit */}
          <div className="space-y-2">
            <Label htmlFor="nom-produit">
              Nom du produit <span className="text-red-500">*</span>
            </Label>
            <Input
              id="nom-produit"
              value={nomProduit}
              onChange={(e) => setNomProduit(e.target.value)}
              placeholder="Ex: SCPI Pierre Europe"
              required
            />
          </div>

          {/* Montant initial */}
          <div className="space-y-2">
            <Label htmlFor="montant">Montant initial (€)</Label>
            <Input
              id="montant"
              type="number"
              step="0.01"
              value={montantInitial}
              onChange={(e) => setMontantInitial(e.target.value)}
              placeholder="Ex: 10000"
            />
          </div>

          {/* Date de souscription */}
          <div className="space-y-2">
            <Label htmlFor="date-souscription">Date de souscription</Label>
            <Input
              id="date-souscription"
              type="date"
              value={dateSouscription}
              onChange={(e) => setDateSouscription(e.target.value)}
            />
          </div>

          {/* Date fin démembrement (si SCPI_DEMEMBREMENT) */}
          {typeProduit === "SCPI_DEMEMBREMENT" && (
            <div className="space-y-2">
              <Label htmlFor="date-fin-demembrement">Date de fin de démembrement</Label>
              <Input
                id="date-fin-demembrement"
                type="date"
                value={dateFinDemembrement}
                onChange={(e) => setDateFinDemembrement(e.target.value)}
              />
            </div>
          )}

          {/* Versement programmé (uniquement AV, PER, SCPI) */}
          {accepteVersementProgramme && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="versement-programme"
                  checked={versementProgramme}
                  onChange={(e) => setVersementProgramme(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="versement-programme">Versement programmé</Label>
              </div>

            {versementProgramme && (
              <div className="grid grid-cols-2 gap-4 ml-6">
                <div className="space-y-2">
                  <Label htmlFor="montant-vp">Montant (€)</Label>
                  <Input
                    id="montant-vp"
                    type="number"
                    step="0.01"
                    value={montantVersementProgramme}
                    onChange={(e) => setMontantVersementProgramme(e.target.value)}
                    placeholder="Ex: 500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frequence">Fréquence</Label>
                  <Select value={frequenceVersement} onValueChange={setFrequenceVersement}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MENSUEL">Mensuel</SelectItem>
                      <SelectItem value="TRIMESTRIEL">Trimestriel</SelectItem>
                      <SelectItem value="SEMESTRIEL">Semestriel</SelectItem>
                      <SelectItem value="ANNUEL">Annuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            </div>
          )}

          {/* Réinvestissement dividendes (uniquement SCPI) */}
          {accepteReinvestissement && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="reinvestissement"
                  checked={reinvestissementDividendes}
                  onChange={(e) => setReinvestissementDividendes(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="reinvestissement">Réinvestissement des dividendes</Label>
              </div>

              {reinvestissementDividendes && (
                <div className="ml-6 space-y-2">
                  <Label htmlFor="pourcentage-reinv">Pourcentage de réinvestissement</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="pourcentage-reinv"
                      type="number"
                      min="0"
                      max="100"
                      value={pourcentageReinvestissement}
                      onChange={(e) => {
                        const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                        setPourcentageReinvestissement(val.toString());
                      }}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pourcentageReinvestissement}% des dividendes seront réinvestis
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes complémentaires..."
              rows={3}
            />
          </div>

          {/* Boutons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : investissement ? "Modifier" : "Créer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
