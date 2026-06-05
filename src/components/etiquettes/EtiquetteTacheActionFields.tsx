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
import { EtiquetteFormPanel } from "@/components/etiquettes/etiquette-form-ui";
import type { TacheActionPriorite } from "@/lib/api/tauri-etiquettes";

interface EtiquetteTacheActionFieldsProps {
  isAuto: boolean;
  tacheActif: boolean;
  onTacheActifChange: (value: boolean) => void;
  tacheTitre: string;
  onTacheTitreChange: (value: string) => void;
  tachePriorite: TacheActionPriorite;
  onTachePrioriteChange: (value: TacheActionPriorite) => void;
  tacheDelaiJours: number;
  onTacheDelaiJoursChange: (value: number) => void;
}

const PRIORITES: { value: TacheActionPriorite; label: string }[] = [
  { value: "BASSE", label: "Basse" },
  { value: "NORMALE", label: "Normale" },
  { value: "HAUTE", label: "Haute" },
];

/**
 * Action « créer une tâche » : quand l'étiquette est posée automatiquement sur un
 * contact, une tâche de suivi est générée (une seule fois par contact).
 */
export function EtiquetteTacheActionFields({
  isAuto,
  tacheActif,
  onTacheActifChange,
  tacheTitre,
  onTacheTitreChange,
  tachePriorite,
  onTachePrioriteChange,
  tacheDelaiJours,
  onTacheDelaiJoursChange,
}: EtiquetteTacheActionFieldsProps) {
  return (
    <EtiquetteFormPanel
      title="Créer une tâche"
      description="Quand l'étiquette est posée automatiquement, une tâche de suivi est créée pour le contact (une fois)."
    >
      {!isAuto && (
        <p className="text-xs text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2">
          L&apos;action se déclenche via la règle automatique. Activez-la dans l&apos;onglet
          « Règle auto » pour que des tâches soient créées.
        </p>
      )}

      <div className="flex items-center justify-between">
        <Label htmlFor="tache-actif" className="text-sm font-medium">
          Activer la création de tâche
        </Label>
        <Switch
          id="tache-actif"
          checked={tacheActif}
          onCheckedChange={onTacheActifChange}
        />
      </div>

      {tacheActif && (
        <>
          <div className="space-y-2">
            <Label htmlFor="tache-titre">Titre de la tâche *</Label>
            <Input
              id="tache-titre"
              value={tacheTitre}
              onChange={(e) => onTacheTitreChange(e.target.value)}
              placeholder="Ex. Appeler {prenom} {nom} pour le suivi"
            />
            <p className="text-xs text-muted-foreground">
              Variables disponibles : <code>{"{prenom}"}</code> et <code>{"{nom}"}</code>{" "}
              (remplacés par le contact).
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
              <Label htmlFor="tache-delai">Échéance (jours après)</Label>
              <Input
                id="tache-delai"
                type="number"
                min={0}
                value={tacheDelaiJours}
                onChange={(e) =>
                  onTacheDelaiJoursChange(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
              />
              <p className="text-xs text-muted-foreground">0 = le jour même.</p>
            </div>
          </div>
        </>
      )}
    </EtiquetteFormPanel>
  );
}
