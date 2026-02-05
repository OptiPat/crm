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
  type ConditionPeriodeAnnee,
} from "@/lib/api/tauri-etiquettes";
import { getAllTemplatesEmail, type TemplateEmail } from "@/lib/api/tauri-templates-email";
import { toast } from "sonner";

interface EtiquetteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  etiquette?: EtiquetteWithCount | null;
  onSuccess: () => void;
}

const ICONES_DISPONIBLES = ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "📅", "📋", "🏠", "🎯", "⚠️", "✅", "❌", "💰", "📧", "🔔"];

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
  const [icone, setIcone] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [priorite, setPriorite] = useState(0);
  
  // Attribution automatique
  const [isAuto, setIsAuto] = useState(false);
  const [conditionType, setConditionType] = useState<string>("DELAI_SANS_CONTACT");
  const [delaiJours, setDelaiJours] = useState(365);
  const [champDate, setChampDate] = useState("date_prochain_suivi");
  const [joursAvant, setJoursAvant] = useState(30);
  const [moisDebut, setMoisDebut] = useState(4);
  const [moisFin, setMoisFin] = useState(5);
  const [categoriesSelectionnees, setCategoriesSelectionnees] = useState<string[]>(["CLIENT"]);
  
  // Email
  const [emailActif, setEmailActif] = useState(false);
  const [emailTemplateId, setEmailTemplateId] = useState<number | null>(null);
  const [emailDelaiJours, setEmailDelaiJours] = useState(0);

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
        setIcone(etiquette.icone);
        setDescription(etiquette.description || "");
        setPriorite(etiquette.priorite);
        
        // Attribution automatique
        setIsAuto(!!etiquette.auto_condition_type);
        if (etiquette.auto_condition_type) {
          setConditionType(etiquette.auto_condition_type);
          
          // Parser la config selon le type
          if (etiquette.auto_condition_type === "DELAI_SANS_CONTACT") {
            const config = parseConditionConfig<ConditionDelaiSansContact>(etiquette.auto_condition_config);
            if (config) setDelaiJours(config.jours);
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
          }
          
          setCategoriesSelectionnees(parseCategories(etiquette.auto_categories));
        }
        
        // Email
        setEmailActif(etiquette.email_actif);
        setEmailTemplateId(etiquette.email_template_id);
        setEmailDelaiJours(etiquette.email_delai_jours);
      } else {
        // Mode création - réinitialiser
        setNom("");
        setCouleur("#3B82F6");
        setIcone(null);
        setDescription("");
        setPriorite(0);
        setIsAuto(false);
        setConditionType("DELAI_SANS_CONTACT");
        setDelaiJours(365);
        setChampDate("date_prochain_suivi");
        setJoursAvant(30);
        setMoisDebut(4);
        setMoisFin(5);
        setCategoriesSelectionnees(["CLIENT"]);
        setEmailActif(false);
        setEmailTemplateId(null);
        setEmailDelaiJours(0);
      }
    }
  }, [open, etiquette]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nom.trim()) {
      toast.error("Le nom est obligatoire");
      return;
    }
    
    setLoading(true);

    try {
      // Construire la configuration de condition
      let autoConditionConfig: string | null = null;
      if (isAuto) {
        if (conditionType === "DELAI_SANS_CONTACT") {
          autoConditionConfig = stringifyConditionConfig({ jours: delaiJours });
        } else if (conditionType === "DATE_APPROCHE") {
          autoConditionConfig = stringifyConditionConfig({ champ: champDate, jours_avant: joursAvant });
        } else if (conditionType === "PERIODE_ANNEE") {
          autoConditionConfig = stringifyConditionConfig({ mois_debut: moisDebut, mois_fin: moisFin });
        }
      }
      
      const data: NewEtiquette = {
        nom: nom.trim(),
        couleur,
        icone,
        description: description.trim() || null,
        priorite,
        auto_condition_type: isAuto ? conditionType : null,
        auto_condition_config: autoConditionConfig,
        auto_categories: isAuto ? stringifyCategories(categoriesSelectionnees) : null,
        email_template_id: emailActif ? emailTemplateId : null,
        email_delai_jours: emailActif ? emailDelaiJours : 0,
        email_actif: emailActif,
        is_default: etiquette?.is_default || false,
      };

      if (etiquette) {
        await updateEtiquette(etiquette.id, data);
        toast.success("Étiquette modifiée");
      } else {
        await createEtiquette(data);
        toast.success("Étiquette créée");
      }
      
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
              {icone && <span>{icone}</span>}
              <span>{nom || "Aperçu"}</span>
            </span>
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

          {/* Icône */}
          <div className="space-y-2">
            <Label>Icône (optionnel)</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIcone(null)}
                className={`w-8 h-8 rounded border flex items-center justify-center text-xs ${
                  icone === null ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                ∅
              </button>
              {ICONES_DISPONIBLES.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcone(ic)}
                  className={`w-8 h-8 rounded border flex items-center justify-center ${
                    icone === ic ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                  }`}
                >
                  {ic}
                </button>
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

          {/* Attribution automatique */}
          <div className="space-y-4 p-4 border rounded-lg">
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
                    </SelectContent>
                  </Select>
                </div>

                {/* Paramètres selon le type */}
                {conditionType === "DELAI_SANS_CONTACT" && (
                  <div className="space-y-2">
                    <Label>Nombre de jours sans contact</Label>
                    <Input
                      type="number"
                      min={1}
                      value={delaiJours}
                      onChange={(e) => setDelaiJours(parseInt(e.target.value) || 1)}
                    />
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
                          <SelectItem value="date_prochain_suivi">Prochain suivi</SelectItem>
                          <SelectItem value="date_fin_demembrement">Fin démembrement</SelectItem>
                          <SelectItem value="date_naissance">Anniversaire</SelectItem>
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
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Envoyer un email</Label>
                <p className="text-sm text-muted-foreground">
                  Envoyer un email automatique après l'attribution
                </p>
              </div>
              <Switch checked={emailActif} onCheckedChange={setEmailActif} />
            </div>

            {emailActif && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>Template d'email</Label>
                  <Select 
                    value={emailTemplateId?.toString() || ""} 
                    onValueChange={(v) => setEmailTemplateId(v ? parseInt(v) : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Délai avant envoi (jours)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={emailDelaiJours}
                    onChange={(e) => setEmailDelaiJours(parseInt(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = envoi immédiat
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
