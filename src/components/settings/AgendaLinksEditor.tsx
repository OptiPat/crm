import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import {
  createEmptyAgendaLink,
  slugifyAgendaLinkId,
  type AgendaLink,
} from "@/lib/emails/agenda-links";

type AgendaLinksEditorProps = {
  links: AgendaLink[];
  onChange: (links: AgendaLink[]) => void;
};

export function AgendaLinksEditor({ links, onChange }: AgendaLinksEditorProps) {
  const update = (index: number, patch: Partial<AgendaLink>) => {
    const next = links.map((l, i) => (i === index ? { ...l, ...patch } : l));
    onChange(next);
  };

  const addLink = () => {
    onChange([...links, createEmptyAgendaLink()]);
  };

  const remove = (index: number) => {
    onChange(links.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-base">Liens Google Agenda</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Créez plusieurs pages de réservation (suivi, premier RDV, etc.). Dans chaque template email,
          choisissez le lien adapté ; le texte utilise <code className="text-xs">{"{{lien_agenda}}"}</code>.
        </p>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/40">
          Aucun lien — ajoutez au moins un lien Google Agenda pour vos prises de RDV.
        </p>
      ) : (
        links.map((link, index) => (
          <div
            key={link.id}
            className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] items-end border rounded-lg p-3 bg-muted/30"
          >
            <div className="space-y-1">
              <Label className="text-xs">Libellé</Label>
              <Input
                value={link.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="Ex : Suivi annuel"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Identifiant (variable)</Label>
              <Input
                value={link.id}
                onChange={(e) =>
                  update(index, { id: slugifyAgendaLinkId(e.target.value) || link.id })
                }
                placeholder="suivi"
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Optionnel : <code>{`{{lien_agenda_${link.id}}}`}</code>
              </p>
            </div>
            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs">URL Google Agenda</Label>
              <Input
                type="url"
                value={link.url}
                onChange={(e) => update(index, { url: e.target.value })}
                placeholder="https://calendar.google.com/calendar/appointments/..."
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-red-600 shrink-0"
              onClick={() => remove(index)}
              title="Supprimer ce lien"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))
      )}

      <Button type="button" variant="outline" size="sm" onClick={addLink}>
        <Plus className="h-4 w-4 mr-1" />
        Ajouter un lien
      </Button>
    </div>
  );
}
