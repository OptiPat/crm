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
import type { EtiquetteFormFieldId } from "@/lib/etiquettes/etiquette-form-validation";
import { cn } from "@/lib/utils";

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
  highlightField?: EtiquetteFormFieldId | null;
}

const PRIORITES: { value: TacheActionPriorite; label: string }[] = [
  { value: "BASSE", label: "Basse" },
  { value: "NORMALE", label: "Normale" },
  { value: "HAUTE", label: "Haute" },
];

/**
 * Action « créer une tâche » : une tâche de suivi est générée au déclenchement
 * campagne (mail Stellium pour Exceltis, envoi email sinon), une fois par contact.
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
  highlightField = null,
}: EtiquetteTacheActionFieldsProps) {
  return (
    <EtiquetteFormPanel
      title="Créer une tâche"
      description="Quand la campagne est déclenchée pour un contact, une tâche de suivi est créée (une fois)."
    >
      <p className="text-xs text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2">
        <strong>Exceltis :</strong> au mail Stellium « Remboursement Exceltis » (déblocage campagne).
        {" "}
        <strong>Autres campagnes email :</strong> à l&apos;envoi du mail depuis Suivi → Envois.
        {!isAuto && (
          <>
            {" "}
            La pose manuelle de l&apos;étiquette ne crée pas de tâche tant que la campagne
            n&apos;est pas déclenchée.
          </>
        )}
      </p>

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
              className={cn(
                highlightField === "tache-titre" &&
                  "ring-2 ring-destructive ring-offset-2 ring-offset-background"
              )}
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
              <Label htmlFor="tache-delai">Échéance (jours après déclenchement)</Label>
              <Input
                id="tache-delai"
                type="number"
                min={0}
                value={tacheDelaiJours}
                onChange={(e) =>
                  onTacheDelaiJoursChange(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
              />
              <p className="text-xs text-muted-foreground">
                0 = le jour du déclenchement. Ex. 15 = relance 15 jours après le mail Stellium
                (Exceltis) ou l&apos;envoi campagne.
              </p>
            </div>
          </div>
        </>
      )}
    </EtiquetteFormPanel>
  );
}
