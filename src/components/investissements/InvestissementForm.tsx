import { useState, useEffect, useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_PRODUIT_GROUP_LABEL =
  "py-2.5 pl-6 pr-2 text-base font-bold uppercase tracking-wide text-foreground";

/** Valeurs proposées dans le menu « Type de produit ». Tout type hors de cette
 *  liste (ex. type importé du RIO : LIVRET_A, EPARGNE_BANCAIRE, LOCATIF…) est
 *  ajouté dynamiquement pour rester affichable et modifiable. */
const KNOWN_TYPE_PRODUITS = new Set<string>([
  "ASSURANCE_VIE",
  "CONTRAT_CAPITALISATION",
  "PER",
  "EPARGNE_SALARIALE",
  "FIP_FCPI",
  "FCPR",
  "G3F",
  "SCPI",
  "SCPI_DEMEMBREMENT",
  "SCPI_FISCALE",
  "PINEL",
  "DENORMANDIE",
  "JEANBRUN",
  "MALRAUX",
  "MONUMENT_HISTORIQUE",
  "DEFICIT_FONCIER",
  "LMNP",
  "LMP",
  "NUE_PROPRIETE",
  "RESIDENCE_PRINCIPALE",
  "LOCATIF_CLASSIQUE",
  "LOCATIF",
  "IMMOBILIER",
  "LIVRET_A",
  "LDDS",
  "LEP",
  "PEL",
  "CEL",
  "CSL",
  "COMPTE_COURANT",
  "EPARGNE_BANCAIRE",
  "PEA",
  "COMPTE_TITRE",
  "PERP",
  "AUTRE",
]);
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getAllFoyers } from "@/lib/api/tauri-foyers";
import { getAllPartenaires } from "@/lib/api/tauri-partenaires";
import {
  createInvestissement,
  updateInvestissement,
  getInvestissementById,
  getNomProduitSuggestions,
  type Investissement,
  type NewInvestissement,
  type NomProduitSuggestion,
} from "@/lib/api/tauri-investissements";
import { InvestissementEncoursPanel } from "@/components/investissements/InvestissementEncoursPanel";
import { InvestissementVersementsPanel } from "@/components/investissements/InvestissementVersementsPanel";
import { isPlacementEncoursEligible } from "@/lib/investissements/investissement-encours";
import { formatNomProduit } from "@/lib/investissements/investissement-display";
import { isVersementComplementaireEligible } from "@/lib/investissements/investissement-versements";
import {
  ContactFormExceltisSection,
  type ExceltisFormChoice,
} from "@/components/contacts/ContactFormExceltisSection";
import {
  ensureExceltisEtiquetteAndAssign,
  getExceltisMillesimeProposals,
  isExceltisEligibleProductType,
} from "@/lib/etiquettes/exceltis";
import { dateFieldToIso } from "@/lib/contacts/contact-form-utils";
import { unixToDateInput } from "@/lib/dates/calendar-date";
import {
  addYearsToDateInput,
  detectDemembrementKind,
  parseDemembrementDuree,
  parseModeDetention,
  stripStructuredDemembrementFromNotes,
  upsertDemembrementDureeInNotes,
  upsertModeDetentionInNotes,
  yearsBetweenDateInputs,
  type DemembrementKind,
  type DetentionDemembrement,
} from "@/lib/investissements/investissement-demembrement";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import {
  acceptsInvestissementFinancingFields,
  isImmobilierFinancingType,
  isScpiFinancingType,
  euroToFinancingCentimes,
  financingCentimesToEuro,
} from "@/lib/investissements/investissement-immo-financing";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  getVisibleInvestissementFormSections,
  INVESTISSEMENT_FORM_SECTION_ICON_CLASS,
  INVESTISSEMENT_FORM_SECTION_META,
  INVESTISSEMENT_FORM_SECTIONS,
  type InvestissementFormSectionKey,
} from "@/lib/investissements/investissement-form-sections";

interface InvestissementFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  investissement?: Investissement | null;
  defaultContactId?: number;
  defaultFoyerId?: number;
  onEncoursUpdated?: () => void;
}

function InvestissementFormSection({
  sectionKey,
  children,
}: {
  sectionKey: InvestissementFormSectionKey;
  children: ReactNode;
}) {
  const meta = INVESTISSEMENT_FORM_SECTION_META[sectionKey];
  const Icon = meta.icon;
  return (
    <div id={INVESTISSEMENT_FORM_SECTIONS[sectionKey]} className="space-y-4 scroll-mt-20">
      <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={INVESTISSEMENT_FORM_SECTION_ICON_CLASS} aria-hidden />
        {meta.label}
      </h3>
      {children}
    </div>
  );
}

function InvestissementFormSectionNav({
  sections,
}: {
  sections: readonly { id: string; label: string; icon: LucideIcon }[];
}) {
  return (
    <nav
      aria-label="Sections du formulaire placement"
      className="sticky top-0 z-10 -mx-1 mb-1 flex flex-wrap gap-1 border-b border-border/80 bg-background/95 pb-2 backdrop-blur-sm"
    >
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <Button
            key={section.id}
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              document
                .getElementById(section.id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {section.label}
          </Button>
        );
      })}
    </nav>
  );
}

export function InvestissementForm({
  open,
  onOpenChange,
  onSuccess,
  investissement,
  defaultContactId,
  defaultFoyerId,
  onEncoursUpdated,
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
  const [demembrementKind, setDemembrementKind] =
    useState<DemembrementKind>("TEMPORAIRE");
  const [dureeDemembrementAns, setDureeDemembrementAns] = useState("");
  const [detentionMode, setDetentionMode] = useState<DetentionDemembrement | null>(
    null
  );
  const [dateFinPret, setDateFinPret] = useState("");
  const [mensualiteCredit, setMensualiteCredit] = useState("");
  const [creditCrd, setCreditCrd] = useState("");
  const [loyerMensuel, setLoyerMensuel] = useState("");
  const [versementProgramme, setVersementProgramme] = useState(false);
  const [montantVersementProgramme, setMontantVersementProgramme] = useState("");
  const [frequenceVersement, setFrequenceVersement] = useState<string>("");
  const [reinvestissementDividendes, setReinvestissementDividendes] = useState(false);
  const [pourcentageReinvestissement, setPourcentageReinvestissement] = useState("100");
  const [notes, setNotes] = useState("");
  const [exceltisChoice, setExceltisChoice] = useState<ExceltisFormChoice>({
    hasExceltis: false,
  });
  const [liveEncours, setLiveEncours] = useState<{
    actuel?: number;
    date?: number;
  }>({});
  const [nomProduitSuggestions, setNomProduitSuggestions] = useState<
    NomProduitSuggestion[]
  >([]);

  const showEncoursSection =
    !!investissement && isPlacementEncoursEligible(typeProduit);

  const showVersementsSection =
    !!investissement && isVersementComplementaireEligible(typeProduit);

  const showExceltisSection =
    !investissement &&
    !investissementCommun &&
    !!contactId &&
    isExceltisEligibleProductType(typeProduit);

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
  const immoFinancing = isImmobilierFinancingType(typeProduit);
  const scpiFinancing = isScpiFinancingType(typeProduit);

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
    if (!isExceltisEligibleProductType(typeProduit)) {
      setExceltisChoice({ hasExceltis: false });
    }
    if (typeProduit !== "SCPI_DEMEMBREMENT") {
      setDemembrementKind("TEMPORAIRE");
      setDureeDemembrementAns("");
      setDetentionMode(null);
    }
  }, [typeProduit, accepteVersementProgramme, accepteReinvestissement]);

  useEffect(() => {
    if (!open || !typeProduit || !partenaireId) {
      setNomProduitSuggestions([]);
      return;
    }

    let cancelled = false;
    const partenaireNumeric = Number(partenaireId);

    void getNomProduitSuggestions(typeProduit, partenaireNumeric)
      .then((suggestions) => {
        if (cancelled) return;
        setNomProduitSuggestions(suggestions);
        if (suggestions.length > 0) {
          setNomProduit((current) =>
            current.trim() === "" ? suggestions[0].nom_produit : current
          );
        }
      })
      .catch((error) => {
        console.error("Error loading nom produit suggestions:", error);
        if (!cancelled) setNomProduitSuggestions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, typeProduit, partenaireId]);

  useEffect(() => {
    if (typeProduit !== "SCPI_DEMEMBREMENT" || demembrementKind !== "TEMPORAIRE") {
      return;
    }
    const years = parseInt(dureeDemembrementAns, 10);
    if (!dateSouscription || !Number.isFinite(years) || years <= 0) return;
    const computed = addYearsToDateInput(dateSouscription, years);
    if (computed) setDateFinDemembrement(computed);
  }, [typeProduit, demembrementKind, dureeDemembrementAns, dateSouscription]);

  useEffect(() => {
    if (demembrementKind === "VIAGER") {
      setDateFinDemembrement("");
      setDureeDemembrementAns("");
    }
  }, [demembrementKind]);

  const [dataLoaded, setDataLoaded] = useState(false);

  // Charger les données quand le dialog s'ouvre
  useEffect(() => {
    if (open) {
      loadData();
    } else {
      setDataLoaded(false);
    }
  }, [open]);

  // Pré-remplir le formulaire APRÈS que les données sont chargées
  useEffect(() => {
    if (open && dataLoaded) {
      if (investissement) {
        // Pré-remplir le formulaire pour modification
        setContactId(investissement.contact_id?.toString() || "");
        setInvestissementCommun(!!investissement.foyer_id);
        setFoyerId(investissement.foyer_id?.toString() || "");
        setTypeProduit(investissement.type_produit);
        setPartenaireId(investissement.partenaire_id?.toString() || "");
        setNomProduit(investissement.nom_produit);
        setMontantInitial(investissement.montant_initial ? (investissement.montant_initial / 100).toString() : "");
        setDateSouscription(
          investissement.date_souscription
            ? unixToDateInput(investissement.date_souscription)
            : ""
        );
        const dateFinDemembInput = investissement.date_fin_demembrement
          ? unixToDateInput(investissement.date_fin_demembrement)
          : "";
        setDateFinDemembrement(dateFinDemembInput);
        const parsedDemembrement = parseDemembrementDuree(investissement.notes);
        setDemembrementKind(
          detectDemembrementKind({
            typeProduit: investissement.type_produit,
            hasDateFin: !!dateFinDemembInput,
            notes: investissement.notes,
          })
        );
        const souscriptionInput = investissement.date_souscription
          ? unixToDateInput(investissement.date_souscription)
          : "";
        setDureeDemembrementAns(
          parsedDemembrement.annees != null
            ? String(parsedDemembrement.annees)
            : yearsBetweenDateInputs(souscriptionInput, dateFinDemembInput) != null
              ? String(yearsBetweenDateInputs(souscriptionInput, dateFinDemembInput))
              : ""
        );
        setDetentionMode(parseModeDetention(investissement.notes));
        setDateFinPret(
          investissement.date_fin_pret ? unixToDateInput(investissement.date_fin_pret) : ""
        );
        setMensualiteCredit(financingCentimesToEuro(investissement.mensualite_credit));
        setCreditCrd(financingCentimesToEuro(investissement.credit_crd));
        setLoyerMensuel(financingCentimesToEuro(investissement.loyer_mensuel));
        setVersementProgramme(investissement.versement_programme);
        setMontantVersementProgramme(investissement.montant_versement_programme ? (investissement.montant_versement_programme / 100).toString() : "");
        setFrequenceVersement(investissement.frequence_versement || "");
        setReinvestissementDividendes(investissement.reinvestissement_dividendes);
        setPourcentageReinvestissement(investissement.notes?.match(/Réinv\. (\d+)%/)?.[1] || "100");
        setNotes(stripStructuredDemembrementFromNotes(investissement.notes || ""));
        setLiveEncours({
          actuel: investissement.encours_actuel,
          date: investissement.encours_date,
        });
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
  }, [open, dataLoaded, investissement, defaultContactId, defaultFoyerId]);

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
      setDataLoaded(true);
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
    setNomProduitSuggestions([]);
    setMontantInitial("");
    setDateSouscription("");
    setDateFinDemembrement("");
    setDemembrementKind("TEMPORAIRE");
    setDureeDemembrementAns("");
    setDetentionMode(null);
    setDateFinPret("");
    setMensualiteCredit("");
    setCreditCrd("");
    setLoyerMensuel("");
    setVersementProgramme(false);
    setMontantVersementProgramme("");
    setFrequenceVersement("");
    setReinvestissementDividendes(false);
    setPourcentageReinvestissement("100");
    setNotes("");
    setExceltisChoice({ hasExceltis: false });
    setLiveEncours({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Pour un investissement de foyer, contactId n'est pas obligatoire
    const hasOwner = investissementCommun ? !!foyerId : !!contactId;
    if (!hasOwner || !typeProduit || !nomProduit) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    setLoading(true);

    try {
      let exceltisOption:
        | ReturnType<typeof getExceltisMillesimeProposals>[number]
        | undefined;
      if (
        !investissement &&
        exceltisChoice.hasExceltis &&
        contactId &&
        isExceltisEligibleProductType(typeProduit)
      ) {
        const proposals = getExceltisMillesimeProposals();
        exceltisOption = proposals.find((p) => p.key === exceltisChoice.millesimeKey);
        if (!exceltisOption) {
          toast.error("Choisissez un millésime Exceltis");
          setLoading(false);
          return;
        }
      }

      let finalNotes = notes || "";
      if (typeProduit === "SCPI_DEMEMBREMENT") {
        const annees =
          demembrementKind === "TEMPORAIRE" && dureeDemembrementAns.trim()
            ? parseInt(dureeDemembrementAns, 10)
            : null;
        finalNotes = upsertDemembrementDureeInNotes(
          finalNotes,
          demembrementKind,
          Number.isFinite(annees) ? annees : null
        );
        finalNotes = upsertModeDetentionInNotes(finalNotes, detentionMode);
      }

      // Stocker le pourcentage dans les notes si réinvestissement activé
      if (reinvestissementDividendes && accepteReinvestissement) {
        const pourcentageInfo = `Réinv. ${pourcentageReinvestissement}%`;
        finalNotes = finalNotes ? `${pourcentageInfo}\n${finalNotes}` : pourcentageInfo;
      }

      const dateFinDemembrementIso =
        typeProduit === "SCPI_DEMEMBREMENT"
          ? demembrementKind === "VIAGER"
            ? undefined
            : dateFieldToIso(dateFinDemembrement)
          : undefined;

      const immoFinancingSave = isImmobilierFinancingType(typeProduit);
      const acceptsFinancingFields = acceptsInvestissementFinancingFields(typeProduit);

      const newInvestissement: NewInvestissement = {
        contact_id: contactId ? parseInt(contactId) : undefined,
        foyer_id: investissementCommun && foyerId ? parseInt(foyerId) : undefined,
        type_produit: typeProduit,
        partenaire_id: partenaireId ? parseInt(partenaireId) : undefined,
        nom_produit: nomProduit,
        montant_initial: montantInitial ? Math.round(parseFloat(montantInitial) * 100) : undefined,
        date_souscription: dateFieldToIso(dateSouscription),
        date_fin_demembrement: dateFinDemembrementIso,
        date_fin_pret: acceptsFinancingFields ? dateFieldToIso(dateFinPret) : undefined,
        mensualite_credit: acceptsFinancingFields
          ? euroToFinancingCentimes(mensualiteCredit)
          : undefined,
        credit_crd: acceptsFinancingFields ? euroToFinancingCentimes(creditCrd) : undefined,
        loyer_mensuel: immoFinancingSave ? euroToFinancingCentimes(loyerMensuel) : undefined,
        versement_programme: accepteVersementProgramme ? versementProgramme : false,
        montant_versement_programme: montantVersementProgramme ? Math.round(parseFloat(montantVersementProgramme) * 100) : undefined,
        frequence_versement: frequenceVersement || undefined,
        reinvestissement_dividendes: accepteReinvestissement ? reinvestissementDividendes : false,
        notes: finalNotes || undefined,
      };

      if (investissement) {
        await updateInvestissement(investissement.id, newInvestissement);
        toast.success("Investissement modifié");
      } else {
        await createInvestissement(newInvestissement);

        if (exceltisOption) {
          const etiquetteNom = await ensureExceltisEtiquetteAndAssign(
            parseInt(contactId, 10),
            exceltisOption
          );
          notifyEtiquettesChanged();
          toast.success(`Investissement créé — étiquette « ${etiquetteNom} »`);
        } else {
          toast.success("Investissement créé");
        }
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving investissement:", error);
      toast.error("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const isEdit = !!investissement;
  const useSheet = isEdit || !!defaultContactId || !!defaultFoyerId;
  const lockedContactContext = Boolean(defaultContactId && !investissementCommun);
  const defaultContact = defaultContactId
    ? contacts.find((c) => c.id === defaultContactId)
    : undefined;

  const sectionVisibility = useMemo(
    () => ({
      financement: scpiFinancing || immoFinancing,
      versements: accepteVersementProgramme || accepteReinvestissement,
      suivi: showEncoursSection || showVersementsSection,
    }),
    [
      scpiFinancing,
      immoFinancing,
      accepteVersementProgramme,
      accepteReinvestissement,
      showEncoursSection,
      showVersementsSection,
    ]
  );

  const navSections = useMemo(
    () =>
      getVisibleInvestissementFormSections(sectionVisibility).map((key) => ({
        id: INVESTISSEMENT_FORM_SECTIONS[key],
        label: INVESTISSEMENT_FORM_SECTION_META[key].navLabel,
        icon: INVESTISSEMENT_FORM_SECTION_META[key].icon,
      })),
    [sectionVisibility]
  );

  const formTitle = useMemo(() => {
    if (investissement) {
      const label = nomProduit.trim() || formatNomProduit(typeProduit || "AUTRE");
      return `Modifier — ${label}`;
    }
    if (defaultContact) {
      return `Nouveau placement — ${defaultContact.prenom} ${defaultContact.nom}`;
    }
    if (defaultFoyerId) {
      const foyer = foyers.find((f) => f.id === defaultFoyerId);
      return foyer ? `Nouveau placement — ${foyer.nom}` : "Nouveau placement";
    }
    return "Nouvel investissement";
  }, [investissement, nomProduit, typeProduit, defaultContact, defaultFoyerId, foyers]);

  const formDescription = isEdit
    ? "Modifiez les informations du placement."
    : lockedContactContext && defaultContact
      ? `Placement pour ${defaultContact.prenom} ${defaultContact.nom}.`
      : "Ajoutez un placement pour un client ou un foyer.";

  const formFooter = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={loading}
      >
        Annuler
      </Button>
      <Button type="submit" disabled={loading}>
        {loading ? "Enregistrement..." : investissement ? "Enregistrer" : "Créer"}
      </Button>
    </>
  );

  const formFields = (
    <>
      {useSheet && <InvestissementFormSectionNav sections={navSections} />}

      <InvestissementFormSection sectionKey="identification">
          {/* Client (masqué si ouvert depuis la fiche contact) */}
          {lockedContactContext && defaultContact ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Client : </span>
              <span className="font-medium">
                {defaultContact.prenom} {defaultContact.nom}
              </span>
            </div>
          ) : (
            !investissementCommun && (
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
            )
          )}

          {/* Investissement commun — masqué si contact verrouillé sans édition foyer */}
          {!lockedContactContext && (
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
          )}

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
                {typeProduit && !KNOWN_TYPE_PRODUITS.has(typeProduit) && (
                  <SelectGroup>
                    <SelectLabel className={TYPE_PRODUIT_GROUP_LABEL}>Type importé</SelectLabel>
                    <SelectItem value={typeProduit}>{formatNomProduit(typeProduit)}</SelectItem>
                  </SelectGroup>
                )}
                <SelectGroup>
                  <SelectLabel className={TYPE_PRODUIT_GROUP_LABEL}>Placement</SelectLabel>
                  <SelectItem value="ASSURANCE_VIE">Assurance Vie</SelectItem>
                  <SelectItem value="CONTRAT_CAPITALISATION">Contrat de Capitalisation</SelectItem>
                  <SelectItem value="PER">PER</SelectItem>
                  <SelectItem value="EPARGNE_SALARIALE">Épargne Salariale</SelectItem>
                  <SelectItem value="FIP_FCPI">FIP/FCPI</SelectItem>
                  <SelectItem value="FCPR">FCPR / FPCI</SelectItem>
                  <SelectItem value="G3F">G3F</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className={TYPE_PRODUIT_GROUP_LABEL}>SCPI</SelectLabel>
                  <SelectItem value="SCPI">SCPI</SelectItem>
                  <SelectItem value="SCPI_DEMEMBREMENT">SCPI Démembrement</SelectItem>
                  <SelectItem value="SCPI_FISCALE">SCPI Fiscale</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className={TYPE_PRODUIT_GROUP_LABEL}>Immobilier</SelectLabel>
                  <SelectItem value="PINEL">Pinel</SelectItem>
                  <SelectItem value="DENORMANDIE">Denormandie</SelectItem>
                  <SelectItem value="JEANBRUN">Jeanbrun</SelectItem>
                  <SelectItem value="MALRAUX">Malraux</SelectItem>
                  <SelectItem value="MONUMENT_HISTORIQUE">Monument Historique</SelectItem>
                  <SelectItem value="DEFICIT_FONCIER">Déficit Foncier</SelectItem>
                  <SelectItem value="LMNP">LMNP</SelectItem>
                  <SelectItem value="LMP">LMP</SelectItem>
                  <SelectItem value="NUE_PROPRIETE">Nue-Propriété</SelectItem>
                  <SelectItem value="RESIDENCE_PRINCIPALE">Résidence Principale</SelectItem>
                  <SelectItem value="LOCATIF_CLASSIQUE">Locatif Classique</SelectItem>
                  <SelectItem value="LOCATIF">Locatif</SelectItem>
                  <SelectItem value="IMMOBILIER">Immobilier (ancien)</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className={TYPE_PRODUIT_GROUP_LABEL}>Épargne / Banque</SelectLabel>
                  <SelectItem value="LIVRET_A">Livret A</SelectItem>
                  <SelectItem value="LDDS">LDD / LDDS</SelectItem>
                  <SelectItem value="LEP">LEP</SelectItem>
                  <SelectItem value="PEL">PEL</SelectItem>
                  <SelectItem value="CEL">CEL</SelectItem>
                  <SelectItem value="CSL">Compte sur livret (CSL)</SelectItem>
                  <SelectItem value="COMPTE_COURANT">Compte courant</SelectItem>
                  <SelectItem value="EPARGNE_BANCAIRE">Épargne bancaire</SelectItem>
                  <SelectItem value="PEA">PEA</SelectItem>
                  <SelectItem value="COMPTE_TITRE">Compte-titres</SelectItem>
                  <SelectItem value="PERP">PERP</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className={TYPE_PRODUIT_GROUP_LABEL}>Autre</SelectLabel>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {showExceltisSection && (
            <ContactFormExceltisSection
              value={exceltisChoice}
              onChange={setExceltisChoice}
            />
          )}

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
              list={
                nomProduitSuggestions.length > 0
                  ? "nom-produit-suggestions"
                  : undefined
              }
              value={nomProduit}
              onChange={(e) => setNomProduit(e.target.value)}
              placeholder="Ex: SCPI Pierre Europe"
              required
            />
            {nomProduitSuggestions.length > 0 && (
              <datalist id="nom-produit-suggestions">
                {nomProduitSuggestions.map((suggestion) => (
                  <option
                    key={suggestion.nom_produit}
                    value={suggestion.nom_produit}
                  />
                ))}
              </datalist>
            )}
          </div>
      </InvestissementFormSection>

      <Separator />

      <InvestissementFormSection sectionKey="montants">
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

          {typeProduit === "SCPI_DEMEMBREMENT" && (
            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div className="space-y-2">
                <Label>Mode de détention</Label>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="detention-usufruit"
                      checked={detentionMode === "USUFRUIT"}
                      onCheckedChange={(checked) =>
                        setDetentionMode(checked === true ? "USUFRUIT" : null)
                      }
                    />
                    <Label htmlFor="detention-usufruit" className="font-normal cursor-pointer">
                      Usufruit
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="detention-nue-propriete"
                      checked={detentionMode === "NUE_PROPRIETE"}
                      onCheckedChange={(checked) =>
                        setDetentionMode(checked === true ? "NUE_PROPRIETE" : null)
                      }
                    />
                    <Label
                      htmlFor="detention-nue-propriete"
                      className="font-normal cursor-pointer"
                    >
                      Nue-propriété
                    </Label>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="demembrement-kind">Type de démembrement</Label>
                <Select
                  value={demembrementKind}
                  onValueChange={(v) => setDemembrementKind(v as DemembrementKind)}
                >
                  <SelectTrigger id="demembrement-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEMPORAIRE">Temporaire (échéance fixe)</SelectItem>
                    <SelectItem value="VIAGER">Viager (sans date de fin)</SelectItem>
                  </SelectContent>
                </Select>
                {demembrementKind === "VIAGER" ? (
                  <p className="text-xs text-muted-foreground">
                    Pas de date de fin — l&apos;alerte « Fin démembrement » ne s&apos;appliquera pas.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Renseignez la durée ou la date de fin pour l&apos;alerte ~6 mois avant échéance.
                  </p>
                )}
              </div>
              {demembrementKind === "TEMPORAIRE" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="duree-demembrement">Durée (années)</Label>
                    <Input
                      id="duree-demembrement"
                      type="number"
                      min={1}
                      max={99}
                      value={dureeDemembrementAns}
                      onChange={(e) => setDureeDemembrementAns(e.target.value)}
                      placeholder="Ex. 10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date-fin-demembrement">Date de fin</Label>
                    <Input
                      id="date-fin-demembrement"
                      type="date"
                      value={dateFinDemembrement}
                      onChange={(e) => {
                        setDateFinDemembrement(e.target.value);
                        const years = yearsBetweenDateInputs(
                          dateSouscription,
                          e.target.value
                        );
                        setDureeDemembrementAns(years != null ? String(years) : "");
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
      </InvestissementFormSection>

      {(scpiFinancing || immoFinancing) && (
        <>
          <Separator />
          <InvestissementFormSection sectionKey="financement">
          {/* Financement SCPI (crédit lié au placement) */}
          {scpiFinancing && !immoFinancing && (
            <div className="space-y-4 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">
                Financement SCPI
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mensualite-credit-scpi">Mensualité crédit (€/mois)</Label>
                  <Input
                    id="mensualite-credit-scpi"
                    type="number"
                    step="0.01"
                    min="0"
                    value={mensualiteCredit}
                    onChange={(e) => setMensualiteCredit(e.target.value)}
                    placeholder="Ex. 650"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credit-crd-scpi">Capital restant dû (€)</Label>
                  <Input
                    id="credit-crd-scpi"
                    type="number"
                    step="0.01"
                    min="0"
                    value={creditCrd}
                    onChange={(e) => setCreditCrd(e.target.value)}
                    placeholder="Ex. 45000"
                  />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label htmlFor="date-fin-pret-scpi">Date de fin de prêt</Label>
                  <Input
                    id="date-fin-pret-scpi"
                    type="date"
                    value={dateFinPret}
                    onChange={(e) => setDateFinPret(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Financement patrimoine immobilier (crédit / loyer liés au bien) */}
          {isImmobilierFinancingType(typeProduit) && (
            <div className="space-y-4 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">
                Financement immobilier (lié à ce bien)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mensualite-credit">Mensualité crédit (€/mois)</Label>
                  <Input
                    id="mensualite-credit"
                    type="number"
                    step="0.01"
                    min="0"
                    value={mensualiteCredit}
                    onChange={(e) => setMensualiteCredit(e.target.value)}
                    placeholder="Ex. 1500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credit-crd">Capital restant dû (€)</Label>
                  <Input
                    id="credit-crd"
                    type="number"
                    step="0.01"
                    min="0"
                    value={creditCrd}
                    onChange={(e) => setCreditCrd(e.target.value)}
                    placeholder="Ex. 210000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loyer-mensuel">Loyer mensuel (€)</Label>
                  <Input
                    id="loyer-mensuel"
                    type="number"
                    step="0.01"
                    min="0"
                    value={loyerMensuel}
                    onChange={(e) => setLoyerMensuel(e.target.value)}
                    placeholder="Ex. 800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date-fin-pret-immo">Date de fin de prêt</Label>
                  <Input
                    id="date-fin-pret-immo"
                    type="date"
                    value={dateFinPret}
                    onChange={(e) => setDateFinPret(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          </InvestissementFormSection>
        </>
      )}

      {(accepteVersementProgramme || accepteReinvestissement) && (
        <>
          <Separator />
          <InvestissementFormSection sectionKey="versements">
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
          </InvestissementFormSection>
        </>
      )}

      {(showVersementsSection || showEncoursSection) && investissement && (
        <>
          <Separator />
          <InvestissementFormSection sectionKey="suivi">
          {showVersementsSection && investissement && (
            <InvestissementVersementsPanel
              investissementId={investissement.id}
              onUpdated={async () => {
                try {
                  const refreshed = await getInvestissementById(investissement.id);
                  setLiveEncours({
                    actuel: refreshed.encours_actuel,
                    date: refreshed.encours_date,
                  });
                  onEncoursUpdated?.();
                } catch (error) {
                  console.error("Refresh encours:", error);
                }
              }}
            />
          )}

          {showEncoursSection && investissement && (
            <InvestissementEncoursPanel
              investissementId={investissement.id}
              montantInitial={investissement.montant_initial}
              dateSouscription={investissement.date_souscription}
              encoursActuel={liveEncours.actuel ?? investissement.encours_actuel}
              encoursDate={liveEncours.date ?? investissement.encours_date}
              onUpdated={async () => {
                try {
                  const refreshed = await getInvestissementById(investissement.id);
                  setLiveEncours({
                    actuel: refreshed.encours_actuel,
                    date: refreshed.encours_date,
                  });
                  onEncoursUpdated?.();
                } catch (error) {
                  console.error("Refresh encours:", error);
                }
              }}
            />
          )}
          </InvestissementFormSection>
        </>
      )}

      <Separator />

      <InvestissementFormSection sectionKey="notes">
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
      </InvestissementFormSection>
    </>
  );

  const formBody = (
    <form
      onSubmit={handleSubmit}
      className={useSheet ? "flex min-h-0 flex-1 flex-col" : "space-y-4"}
    >
      <div className={useSheet ? "min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" : "contents"}>
        {formFields}
      </div>
      {useSheet ? (
        <SheetFooter className="mt-0 shrink-0 border-t bg-background pt-4">
          {formFooter}
        </SheetFooter>
      ) : (
        <DialogFooter className="pt-4">{formFooter}</DialogFooter>
      )}
    </form>
  );

  return useSheet ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl sm:max-h-[100dvh]"
      >
        <div className="shrink-0 border-b px-6 py-4">
          <SheetHeader>
            <SheetTitle>{formTitle}</SheetTitle>
            <SheetDescription>{formDescription}</SheetDescription>
          </SheetHeader>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-6 py-4">{formBody}</div>
      </SheetContent>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{formTitle}</DialogTitle>
          <DialogDescription>{formDescription}</DialogDescription>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}
