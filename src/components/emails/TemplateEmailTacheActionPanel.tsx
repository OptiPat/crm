import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TacheActionPriorite } from "@/lib/api/tauri-etiquettes";

interface TemplateEmailTacheActionPanelProps {
  tacheActif: boolean;
  onTacheActifChange: (value: boolean) => void;
  tacheTitre: string;
  onTacheTitreChange: (value: string) => void;
  tachePriorite: TacheActionPriorite;
  onTachePrioriteChange: (value: TacheActionPriorite) => void;
  tacheDelaiJours: number;
  onTacheDelaiJoursChange: (value: number) => void;
  highlightTitre?: boolean;
}

const PRIORITES: { value: TacheActionPriorite; label: string }[] = [
  { value: "BASSE", label: "Basse" },
  { value: "NORMALE", label: "Normale" },
  { value: "HAUTE", label: "Haute" },
];

/** Action « créer une tâche » déclenchée à l'envoi campagne depuis Suivi → Envois. */
export function TemplateEmailTacheActionPanel({
  tacheActif,
  onTacheActifChange,
  tacheTitre,
  onTacheTitreChange,
  tachePriorite,
  onTachePrioriteChange,
  tacheDelaiJours,
  onTacheDelaiJoursChange,
  highlightTitre = false,
}: TemplateEmailTacheActionPanelProps) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-sm font-medium">Créer une tâche</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Quand le mail campagne est envoyé depuis Suivi → Envois, une tâche de suivi est créée
          (une fois par contact).
        </p>
      </div>

      <p className="text-xs text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2">
        Déclenchement : envoi effectif du modèle depuis la file Envois (campagnes éphémères, SCPI,
        déclencheur, etc.). Contacts tagués mais retirés, ignorés ou annulés ne reçoivent pas de
        tâche — uniquement ceux pour qui le mail a bien été envoyé.
      </p>

      <div className="flex items-center justify-between">
        <Label htmlFor="template-tache-actif" className="text-sm font-medium">
          Activer la création de tâche
        </Label>
        <Switch
          id="template-tache-actif"
          checked={tacheActif}
          onCheckedChange={onTacheActifChange}
        />
      </div>

      {tacheActif && (
        <>
          <div className="space-y-2">
            <Label htmlFor="template-tache-titre">Titre de la tâche *</Label>
            <Input
              id="template-tache-titre"
              value={tacheTitre}
              onChange={(e) => onTacheTitreChange(e.target.value)}
              placeholder="Ex. Appeler {prenom} {nom} après l'envoi"
              className={
                highlightTitre
                  ? "ring-2 ring-destructive ring-offset-2 ring-offset-background"
                  : undefined
              }
            />
            <p className="text-xs text-muted-foreground">
              Variables : <code>{"{prenom}"}</code> et <code>{"{nom}"}</code>.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priorité</Label>
              <Select
                value={tachePriorite}
                onValueChange={(v) => onTachePrioriteChange(v as TacheActionPriorite)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-tache-delai">Échéance (jours après envoi)</Label>
              <Input
                id="template-tache-delai"
                type="number"
                min={0}
                value={tacheDelaiJours}
                onChange={(e) =>
                  onTacheDelaiJoursChange(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
              />
              <p className="text-xs text-muted-foreground">0 = le jour de l&apos;envoi.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
