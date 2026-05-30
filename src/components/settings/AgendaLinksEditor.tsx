import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarPlus, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  createEmptyAgendaLink,
  slugifyAgendaLinkId,
  type AgendaLink,
} from "@/lib/emails/agenda-links";

type AgendaLinksEditorProps = {
  links: AgendaLink[];
  onChange: (links: AgendaLink[]) => void;
  embedded?: boolean;
};

export function AgendaLinksEditor({ links, onChange, embedded }: AgendaLinksEditorProps) {
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
    <div className="space-y-4">
      {!embedded && (
        <div>
          <Label className="text-base flex items-center gap-1.5">
            <CalendarPlus className="h-4 w-4 text-muted-foreground" />
            Liens Google Agenda
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            Variable template :{" "}
            <code className="text-xs bg-muted px-1 rounded">{"{{lien_agenda}}"}</code>
          </p>
        </div>
      )}

      {links.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 px-4 text-center bg-muted/20">
          <CalendarPlus className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground max-w-sm">
            Ajoutez une page de réservation Google Agenda pour vos prises de RDV dans les emails.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={addLink}>
            <Plus className="h-4 w-4 mr-1" />
            Premier lien
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link, index) => (
            <div
              key={`agenda-link-row-${index}`}
              className="rounded-xl border border-border/80 bg-background overflow-hidden shadow-sm"
            >
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border/60">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" aria-hidden />
                <span className="text-xs font-medium text-muted-foreground">
                  Lien {index + 1}
                  {link.label ? ` — ${link.label}` : ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => remove(index)}
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Libellé</Label>
                  <Input
                    value={link.label}
                    onChange={(e) => update(index, { label: e.target.value })}
                    placeholder="Suivi annuel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Identifiant</Label>
                  <Input
                    value={link.id}
                    onChange={(e) => update(index, { id: e.target.value })}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const normalized = raw
                        ? slugifyAgendaLinkId(raw)
                        : slugifyAgendaLinkId(link.label);
                      if (normalized) update(index, { id: normalized });
                    }}
                    placeholder="suivi"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label className="text-xs">URL Google Agenda</Label>
                  <Input
                    type="url"
                    value={link.url}
                    onChange={(e) => update(index, { url: e.target.value })}
                    placeholder="https://calendar.google.com/..."
                  />
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addLink}>
            <Plus className="h-4 w-4 mr-1" />
            Ajouter un lien
          </Button>
        </div>
      )}
    </div>
  );
}
