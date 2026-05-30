import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  createEtiquette, 
  updateEtiquette, 
  getContrastColor,
  stringifyConditionConfig,
  stringifyCategories,
  parseConditionConfig,
  parseCategories,
  COULEURS_ETIQUETTES,
  MOIS_LABELS,
  type NewEtiquette, 
  type EtiquetteWithCount,
  type ConditionDelaiSansContact,
  type ConditionDateApproche,
  type ConditionDateApprocheInvestissement,
  type ConditionPeriodeAnnee,
  type ConditionTypeProduit,
  type ConditionAgeApproche,
} from "@/lib/api/tauri-etiquettes";
import { INVESTISSEMENT_TYPE_GROUPS } from "@/lib/etiquettes/etiquette-investissement-types";
import {
  localDatetimeToUnix,
  unixToLocalDatetime,
} from "@/lib/etiquettes/etiquette-email-preview";
import { getAllTemplatesEmail, type TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  getTemplateCategoryMeta,
  suggestTemplateIdForEtiquette,
} from "@/lib/emails/template-email-meta";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { toast } from "sonner";

interface EtiquetteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  etiquette?: EtiquetteWithCount | null;
  onSuccess: () => void;
}

const CATEGORIES_CONTACTS = [
  { value: "CLIENT", label: "Client" },
  { value: "PROSPECT_CLIENT", label: "Prospect client" },
  { value: "PROSPECT_FILLEUL", label: "Prospect filleul" },
  { value: "SUSPECT_CLIENT", label: "Suspect client" },
  { value: "SUSPECT_FILLEUL", label: "Suspect filleul" },
];

export function EtiquetteForm({ open, onOpenChange, etiquette, onSuccess }: EtiquetteFormProps) {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateEmail[]>([]);
  
  // État du formulaire
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState("#3B82F6");
  const [description, setDescription] = useState("");
  const [priorite, setPriorite] = useState(0);
  const [actif, setActif] = useState(true);
  
  // Attribution automatique
  const [isAuto, setIsAuto] = useState(false);
  const [conditionType, setConditionType] = useState<string>("DELAI_SANS_CONTACT");
  const [delaiJours, setDelaiJours] = useState(365);
  const [inclureSansDate, setInclureSansDate] = useState(true);
  const [ageCible, setAgeCible] = useState(69);
  const [ageJoursAvant, setAgeJoursAvant] = useState(30);
  const [champDate, setChampDate] = useState("date_prochain_suivi");
  const [joursAvant, setJoursAvant] = useState(30);
  const [moisDebut, setMoisDebut] = useState(4);
  const [moisFin, setMoisFin] = useState(5);
  const [typesProduitSelectionnes, setTypesProduitSelectionnes] = useState<string[]>([]);
  const [invChampDate, setInvChampDate] = useState("date_fin_demembrement");
  const [invJoursAvant, setInvJoursAvant] = useState(180);
  const [invTypesProduit, setInvTypesProduit] = useState<string[]>([]);
  const [categoriesSelectionnees, setCategoriesSelectionnees] = useState<string[]>(["CLIENT"]);
  
  // Email
  const [emailActif, setEmailActif] = useState(false);
  const [emailTemplateId, setEmailTemplateId] = useState<number | null>(null);
  const [emailEnvoiLocal, setEmailEnvoiLocal] = useState("");

  // Charger les templates email
  useEffect(() => {
    if (open) {
      getAllTemplatesEmail()
        .then(setTemplates)
        .catch(console.error);
    }
  }, [open]);

  // Initialiser le formulaire quand on ouvre/change d'étiquette
  useEffect(() => {
    if (open) {
      if (etiquette) {
        // Mode édition
        setNom(etiquette.nom);
        setCouleur(etiquette.couleur);
        setDescription(etiquette.description || "");
        setPriorite(etiquette.priorite);
        setActif(etiquette.actif !== false);

        // Attribution automatique
        setIsAuto(!!etiquette.auto_condition_type);
        if (etiquette.auto_condition_type) {
          setConditionType(etiquette.auto_condition_type);
          
          // Parser la config selon le type
          if (etiquette.auto_condition_type === "DELAI_SANS_CONTACT") {
            const config = parseConditionConfig<ConditionDelaiSansContact>(etiquette.auto_condition_config);
            if (config) {
              setDelaiJours(config.jours);
              setInclureSansDate(config.inclure_sans_date !== false);
            }
          } else if (etiquette.auto_condition_type === "AGE_APPROCHE") {
            const config = parseConditionConfig<ConditionAgeApproche>(etiquette.auto_condition_config);
            if (config) {
              setAgeCible(config.age);
              setAgeJoursAvant(config.jours_avant);
            }
          } else if (etiquette.auto_condition_type === "DATE_APPROCHE") {
            const config = parseConditionConfig<ConditionDateApproche>(etiquette.auto_condition_config);
            if (config) {
              setChampDate(config.champ);
              setJoursAvant(config.jours_avant);
            }
          } else if (etiquette.auto_condition_type === "PERIODE_ANNEE") {
            const config = parseConditionConfig<ConditionPeriodeAnnee>(etiquette.auto_condition_config);
            if (config) {
              setMoisDebut(config.mois_debut);
              setMoisFin(config.mois_fin);
            }
          } else if (etiquette.auto_condition_type === "TYPE_PRODUIT") {
            const config = parseConditionConfig<ConditionTypeProduit>(etiquette.auto_condition_config);
            if (config) setTypesProduitSelectionnes(config.types);
          } else if (etiquette.auto_condition_type === "DATE_APPROCHE_INVESTISSEMENT") {
            const config = parseConditionConfig<ConditionDateApprocheInvestissement>(
              etiquette.auto_condition_config
            );
            if (config) {
              setInvChampDate(config.champ);
              setInvJoursAvant(config.jours_avant);
              setInvTypesProduit(config.types_produit ?? []);
            }
          }
          
          setCategoriesSelectionnees(parseCategories(etiquette.auto_categories));
        }
        
        // Email
        setEmailActif(etiquette.email_actif);
        setEmailTemplateId(etiquette.email_template_id);
        setEmailEnvoiLocal(unixToLocalDatetime(etiquette.email_envoi_prevu));
      } else {
        // Mode création - réinitialiser
        setNom("");
        setCouleur("#3B82F6");
        setDescription("");
        setPriorite(0);
        setActif(true);
        setIsAuto(false);
        setConditionType("DELAI_SANS_CONTACT");
        setDelaiJours(365);
        setInclureSansDate(true);
        setAgeCible(69);
        setAgeJoursAvant(30);
        setChampDate("date_prochain_suivi");
        setJoursAvant(30);
        setMoisDebut(4);
        setMoisFin(5);
        setTypesProduitSelectionnes([]);
        setInvChampDate("date_fin_demembrement");
        setInvJoursAvant(180);
        setInvTypesProduit([]);
        setCategoriesSelectionnees(["CLIENT"]);
        setEmailActif(false);
        setEmailTemplateId(null);
        setEmailEnvoiLocal("");
      }
    }
  }, [open, etiquette]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nom.trim()) {
      toast.error("Le nom est obligatoire");
      return;
    }

    if (emailActif) {
      if (!emailTemplateId) {
        toast.error("Sélectionnez un template d'email");
        return;
      }
      if (!emailEnvoiLocal.trim()) {
        toast.error("Indiquez la date et l'heure d'envoi prévue");
        return;
      }
    }

    if (actif && isAuto && categoriesSelectionnees.length === 0) {
      toast.error("Sélectionnez au moins une catégorie de contact");
      return;
    }

    if (actif && isAuto && conditionType === "TYPE_PRODUIT" && typesProduitSelectionnes.length === 0) {
      toast.error("Sélectionnez au moins un type de produit");
      return;
    }
    
    setLoading(true);

    try {
      // Construire la configuration de condition
      let autoConditionConfig: string | null = null;
      if (isAuto) {
        if (conditionType === "DELAI_SANS_CONTACT") {
          autoConditionConfig = stringifyConditionConfig({
            jours: delaiJours,
            inclure_sans_date: inclureSansDate,
          });
        } else if (conditionType === "AGE_APPROCHE") {
          autoConditionConfig = stringifyConditionConfig({
            age: ageCible,
            jours_avant: ageJoursAvant,
          });
        } else if (conditionType === "DATE_APPROCHE") {
          autoConditionConfig = stringifyConditionConfig({ champ: champDate, jours_avant: joursAvant });
        } else if (conditionType === "PERIODE_ANNEE") {
          autoConditionConfig = stringifyConditionConfig({ mois_debut: moisDebut, mois_fin: moisFin });
        } else if (conditionType === "TYPE_PRODUIT") {
          autoConditionConfig = stringifyConditionConfig({ types: typesProduitSelectionnes });
        } else if (conditionType === "DATE_APPROCHE_INVESTISSEMENT") {
          autoConditionConfig = stringifyConditionConfig({
            champ: invChampDate,
            jours_avant: invJoursAvant,
            types_produit: invTypesProduit.length > 0 ? invTypesProduit : undefined,
          });
        }
      }
      
      const data: NewEtiquette = {
        nom: nom.trim(),
        couleur,
        icone: null,
        description: description.trim() || null,
        priorite,
        auto_condition_type: isAuto ? conditionType : null,
        auto_condition_config: autoConditionConfig,
        auto_categories: isAuto ? stringifyCategories(categoriesSelectionnees) : null,
        email_template_id: emailActif ? emailTemplateId : null,
        email_delai_jours: 0,
        email_envoi_prevu: emailActif ? localDatetimeToUnix(emailEnvoiLocal) : null,
        email_actif: emailActif,
        is_default: etiquette?.is_default || false,
        actif,
      };

      if (etiquette) {
        await updateEtiquette(etiquette.id, data);
        toast.success("Étiquette modifiée");
      } else {
        await createEtiquette(data);
        toast.success("Étiquette créée");
      }
      
      notifyEtiquettesChanged();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving etiquette:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryToggle = (category: string) => {
    setCategoriesSelectionnees(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const toggleTypeInList = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {etiquette ? "Modifier l'étiquette" : "Nouvelle étiquette"}
          </DialogTitle>
          <DialogDescription>
            Personnalisez l'apparence et le comportement de cette étiquette
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Prévisualisation */}
          <div className="flex items-center justify-center py-4 bg-muted/50 rounded-lg">
            <span
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium shadow-md"
              style={{
                backgroundColor: couleur,
                color: getContrastColor(couleur)
              }}
            >
              <span>{nom || "Aperçu"}</span>
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="actif" className="text-base">Étiquette active</Label>
              <p className="text-xs text-muted-foreground">
                Désactivée : plus de règle auto ni campagne email. Les tags manuels restent sur les fiches.
              </p>
            </div>
            <Switch id="actif" checked={actif} onCheckedChange={setActif} />
          </div>

          {/* Nom */}
          <div className="space-y-2">
            <Label htmlFor="nom">Nom de l'étiquette *</Label>
            <Input
              id="nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex: Suivi urgent, VIP, À rappeler..."
              required
              autoFocus
            />
          </div>

          {/* Couleur */}
          <div className="space-y-2">
            <Label>Couleur</Label>
            <div className="flex flex-wrap gap-2">
              {COULEURS_ETIQUETTES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setCouleur(c.code)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    couleur === c.code 
                      ? "border-primary scale-110 shadow-md" 
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.code }}
                  title={c.nom}
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optionnel)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description de cette étiquette..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priorite">Priorité d&apos;affichage</Label>
            <Input
              id="priorite"
              type="number"
              min={0}
              max={100}
              value={priorite}
              onChange={(e) => setPriorite(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            />
            <p className="text-xs text-muted-foreground">
              Plus la valeur est élevée, plus le badge apparaît en premier sur les fiches contact (0–100).
            </p>
          </div>

          {etiquette?.is_default && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Étiquette système : désactivez-la si vous ne l&apos;utilisez pas (les attributions automatiques seront retirées). La suppression reste impossible.
            </p>
          )}

          {!actif && (
            <p className="text-xs text-muted-foreground bg-muted/50 border rounded-md px-3 py-2">
              Étiquette inactive : vous pouvez préparer les règles ci-dessous ; elles ne s&apos;appliqueront qu&apos;à la réactivation.
            </p>
          )}

          {/* Attribution automatique */}
          <div className={`space-y-4 p-4 border rounded-lg ${!actif ? "opacity-90" : ""}`}>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Attribution automatique</Label>
                <p className="text-sm text-muted-foreground">
                  L'étiquette sera attribuée automatiquement selon des conditions
                </p>
              </div>
              <Switch checked={isAuto} onCheckedChange={setIsAuto} />
            </div>

            {isAuto && (
              <div className="space-y-4 pt-4 border-t">
                {/* Type de condition */}
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select value={conditionType} onValueChange={setConditionType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DELAI_SANS_CONTACT">
                        Délai sans contact
                      </SelectItem>
                      <SelectItem value="DATE_APPROCHE">
                        Date qui approche
                      </SelectItem>
                      <SelectItem value="PERIODE_ANNEE">
                        Période de l'année
                      </SelectItem>
                      <SelectItem value="TYPE_PRODUIT">
                        Détient un type de produit
                      </SelectItem>
                      <SelectItem value="DATE_APPROCHE_INVESTISSEMENT">
                        Date sur un investissement (contact ou foyer)
                      </SelectItem>
                      <SelectItem value="AGE_APPROCHE">
                        Âge approchant (ex. 69 ans)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Les règles « investissement » incluent les produits du contact et ceux du foyer commun.
                  </p>
                </div>

                {/* Paramètres selon le type */}
                {conditionType === "DELAI_SANS_CONTACT" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Nombre de jours sans contact</Label>
                      <Input
                        type="number"
                        min={1}
                        value={delaiJours}
                        onChange={(e) => setDelaiJours(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="inclure-sans-date"
                        checked={inclureSansDate}
                        onCheckedChange={(c) => setInclureSansDate(!!c)}
                      />
                      <Label htmlFor="inclure-sans-date" className="text-sm font-normal cursor-pointer">
                        Inclure les contacts sans date de dernier contact
                      </Label>
                    </div>
                  </div>
                )}

                {conditionType === "AGE_APPROCHE" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Âge cible</Label>
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        value={ageCible}
                        onChange={(e) => setAgeCible(parseInt(e.target.value) || 69)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dans les prochains (jours)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={ageJoursAvant}
                        onChange={(e) => setAgeJoursAvant(parseInt(e.target.value) || 30)}
                      />
                    </div>
                  </div>
                )}

                {conditionType === "DATE_APPROCHE" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Champ date</Label>
                      <Select value={champDate} onValueChange={setChampDate}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="date_prochain_suivi">Prochain suivi client</SelectItem>
                          <SelectItem value="date_prochain_suivi_filleul">Prochain suivi filleul</SelectItem>
                          <SelectItem value="date_dernier_contact_filleul">Dernier contact filleul</SelectItem>
                          <SelectItem value="date_naissance">Date de naissance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Jours avant</Label>
                      <Input
                        type="number"
                        min={1}
                        value={joursAvant}
                        onChange={(e) => setJoursAvant(parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                )}

                {conditionType === "TYPE_PRODUIT" && (
                  <div className="space-y-2">
                    <Label>Types de produits détenus (au moins un)</Label>
                    <div className="max-h-48 overflow-y-auto border rounded-md p-3 space-y-3">
                      {INVESTISSEMENT_TYPE_GROUPS.map((group) => (
                        <div key={group.label}>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            {group.label}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {group.types.map((t) => (
                              <div key={t.value} className="flex items-center gap-1.5">
                                <Checkbox
                                  id={`type-${t.value}`}
                                  checked={typesProduitSelectionnes.includes(t.value)}
                                  onCheckedChange={() =>
                                    toggleTypeInList(t.value, setTypesProduitSelectionnes)
                                  }
                                />
                                <Label
                                  htmlFor={`type-${t.value}`}
                                  className="text-sm font-normal cursor-pointer"
                                >
                                  {t.label}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {conditionType === "DATE_APPROCHE_INVESTISSEMENT" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Date sur l&apos;investissement</Label>
                        <Select value={invChampDate} onValueChange={setInvChampDate}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="date_fin_demembrement">
                              Fin de démembrement
                            </SelectItem>
                            <SelectItem value="date_fin_pret">Fin de prêt</SelectItem>
                            <SelectItem value="date_souscription">Date de souscription</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Dans les prochains (jours)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={invJoursAvant}
                          onChange={(e) => setInvJoursAvant(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Limiter aux types (optionnel, vide = tous)</Label>
                      <div className="max-h-36 overflow-y-auto border rounded-md p-2 flex flex-wrap gap-2">
                        {INVESTISSEMENT_TYPE_GROUPS.flatMap((g) => g.types).map((t) => (
                          <div key={`inv-${t.value}`} className="flex items-center gap-1">
                            <Checkbox
                              id={`inv-type-${t.value}`}
                              checked={invTypesProduit.includes(t.value)}
                              onCheckedChange={() =>
                                toggleTypeInList(t.value, setInvTypesProduit)
                              }
                            />
                            <Label
                              htmlFor={`inv-type-${t.value}`}
                              className="text-xs font-normal cursor-pointer"
                            >
                              {t.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {conditionType === "PERIODE_ANNEE" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Du mois de</Label>
                      <Select value={moisDebut.toString()} onValueChange={(v) => setMoisDebut(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MOIS_LABELS.map((m) => (
                            <SelectItem key={m.value} value={m.value.toString()}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Au mois de</Label>
                      <Select value={moisFin.toString()} onValueChange={(v) => setMoisFin(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MOIS_LABELS.map((m) => (
                            <SelectItem key={m.value} value={m.value.toString()}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Catégories concernées */}
                <div className="space-y-2">
                  <Label>Catégories de contacts concernées</Label>
                  <div className="flex flex-wrap gap-3">
                    {CATEGORIES_CONTACTS.map((cat) => (
                      <div key={cat.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`cat-${cat.value}`}
                          checked={categoriesSelectionnees.includes(cat.value)}
                          onCheckedChange={() => handleCategoryToggle(cat.value)}
                        />
                        <Label htmlFor={`cat-${cat.value}`} className="text-sm font-normal cursor-pointer">
                          {cat.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action email */}
          <div className={`space-y-4 p-4 border rounded-lg ${!actif ? "opacity-90" : ""}`}>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Campagne email</Label>
                <p className="text-sm text-muted-foreground">
                  Prépare une file d&apos;envoi ; vous confirmez chaque email dans Suivi → Envois
                </p>
              </div>
              <Switch
                checked={emailActif}
                onCheckedChange={(checked) => {
                  setEmailActif(checked);
                  if (checked && !emailTemplateId && templates.length > 0 && nom.trim()) {
                    const suggested = suggestTemplateIdForEtiquette(nom, templates);
                    if (suggested) setEmailTemplateId(suggested);
                  }
                }}
              />
            </div>

            {emailActif && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Template d&apos;email</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!nom.trim() || templates.length === 0}
                      onClick={() => {
                        const id = suggestTemplateIdForEtiquette(nom, templates);
                        if (id) {
                          setEmailTemplateId(id);
                          toast.success("Template suggéré pour cette étiquette");
                        } else {
                          toast.info(
                            "Aucun modèle correspondant — ajoutez-en un dans Templates Email"
                          );
                        }
                      }}
                    >
                      Suggérer
                    </Button>
                  </div>
                  <Select
                    value={emailTemplateId?.toString() || ""}
                    onValueChange={(v) => setEmailTemplateId(v ? parseInt(v) : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => {
                        const cat = getTemplateCategoryMeta(t.categorie);
                        return (
                          <SelectItem key={t.id} value={t.id.toString()}>
                            {t.nom} ({cat.label})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Les modèles « Relance », « IR », etc. sont créés depuis Templates Email.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-envoi-prevu">Date et heure d&apos;envoi prévue</Label>
                  <Input
                    id="email-envoi-prevu"
                    type="datetime-local"
                    value={emailEnvoiLocal}
                    onChange={(e) => setEmailEnvoiLocal(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    À partir de ce moment, les contacts taggés apparaîtront dans la file « Prêts à envoyer ».
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : etiquette ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
