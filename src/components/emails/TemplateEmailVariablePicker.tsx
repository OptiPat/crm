import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { EmailTemplateCategory } from "@/lib/emails/template-email-meta";
import type { AgendaLink } from "@/lib/emails/agenda-links";
import {
  filterVariablesByQuery,
  resolveEmailVariablePicker,
  type EmailVariableDef,
  type EmailVariableGroupId,
  type EmailVariablePickerSection,
} from "@/lib/emails/email-variable-registry";

type TemplateEmailVariablePickerProps = {
  categorie: EmailTemplateCategory;
  sujet: string;
  corps: string;
  corpsHtml: string;
  templateNom: string;
  agendaLinks: AgendaLink[];
  placementConformeTriggerEnabled?: boolean;
  onInsert: (token: string, field: "sujet" | "corps") => void;
  onMouseDownCapture?: () => void;
};

type DisplaySection = {
  id: string;
  label: string;
  hint?: string;
  variables: EmailVariableDef[];
  groupId: EmailVariableGroupId | "merged";
  muted?: boolean;
};

function groupAccentClass(groupId: string): string {
  switch (groupId) {
    case "agenda":
      return "border-amber-300/80";
    case "stellium":
      return "border-emerald-300/80 bg-emerald-50/40";
    case "scpi":
      return "border-teal-300/80 bg-teal-50/30";
    case "pipe":
      return "border-[#c43630]/25 bg-[#c43630]/5";
    case "placement":
      return "border-purple-300/80 bg-purple-50/30";
    default:
      return "";
  }
}

function formatTooltip(variable: EmailVariableDef): string {
  const format =
    variable.format === "html" ? " (HTML)" : variable.format === "text" ? " (texte)" : "";
  return `${variable.token}${format}\n${variable.hint}`;
}

function VariableChip({
  variable,
  groupId,
  onInsert,
}: {
  variable: EmailVariableDef;
  groupId: string;
  onInsert: (token: string, field: "sujet" | "corps") => void;
}) {
  const accent = groupAccentClass(groupId);
  const tooltip = formatTooltip(variable);

  return (
    <span className="inline-flex shrink-0">
      <button
        type="button"
        className={`inline-flex h-5 max-w-[11rem] cursor-pointer items-center truncate rounded-l border border-r-0 bg-background px-1.5 text-[10px] font-medium leading-none hover:bg-primary hover:text-primary-foreground ${accent}`}
        title={`${tooltip}\n→ message`}
        onMouseDown={(event) => {
          event.preventDefault();
          onInsert(variable.token, "corps");
        }}
      >
        {variable.label}
      </button>
      <button
        type="button"
        className="inline-flex h-5 cursor-pointer items-center rounded-r border bg-muted/60 px-1 text-[9px] leading-none text-muted-foreground hover:bg-muted"
        title={`${variable.token} → objet`}
        onMouseDown={(event) => {
          event.preventDefault();
          onInsert(variable.token, "sujet");
        }}
      >
        obj
      </button>
    </span>
  );
}

function mergeDisplaySections(
  sections: EmailVariablePickerSection[],
  muted = false
): DisplaySection[] {
  const contact = sections.find((s) => s.meta.id === "contact");
  const cgp = sections.find((s) => s.meta.id === "cgp");
  const merged: DisplaySection[] = [];

  if (contact || cgp) {
    merged.push({
      id: muted ? "contact-cgp-other" : "contact-cgp",
      label: "Contact & conseiller",
      variables: [...(contact?.variables ?? []), ...(cgp?.variables ?? [])],
      groupId: "merged",
      muted,
    });
  }

  for (const section of sections) {
    if (section.meta.id === "contact" || section.meta.id === "cgp") continue;
    merged.push({
      id: muted ? `${section.meta.id}-other` : section.meta.id,
      label: section.meta.label,
      hint: section.meta.description,
      variables: section.variables,
      groupId: section.meta.id,
      muted,
    });
  }
  return merged.filter((s) => s.variables.length > 0);
}

function VariableGroupRow({
  section,
  onInsert,
}: {
  section: DisplaySection;
  onInsert: (token: string, field: "sujet" | "corps") => void;
}) {
  const accentGroup = section.groupId === "merged" ? "contact" : section.groupId;

  return (
    <div className="flex gap-2">
      <span
        className={`w-[7.5rem] shrink-0 pt-0.5 text-[10px] font-medium leading-tight ${
          section.muted ? "text-muted-foreground/70" : "text-muted-foreground"
        }`}
        title={section.hint}
      >
        {section.label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
        {section.variables.map((v) => (
          <VariableChip
            key={v.token}
            variable={v}
            groupId={v.group === "contact" || v.group === "cgp" ? accentGroup : v.group}
            onInsert={onInsert}
          />
        ))}
      </div>
    </div>
  );
}

export function TemplateEmailVariablePicker({
  categorie,
  sujet,
  corps,
  corpsHtml,
  templateNom,
  agendaLinks,
  placementConformeTriggerEnabled,
  onInsert,
  onMouseDownCapture,
}: TemplateEmailVariablePickerProps) {
  const [query, setQuery] = useState("");

  const resolved = useMemo(
    () =>
      resolveEmailVariablePicker(
        {
          categorie,
          sujet,
          corps,
          corpsHtml,
          templateNom,
          placementConformeTriggerEnabled,
        },
        agendaLinks
      ),
    [
      categorie,
      sujet,
      corps,
      corpsHtml,
      templateNom,
      placementConformeTriggerEnabled,
      agendaLinks,
    ]
  );

  const primaryDisplay = useMemo(
    () => mergeDisplaySections(resolved.primarySections),
    [resolved.primarySections]
  );
  const otherDisplay = useMemo(
    () => mergeDisplaySections(resolved.otherSections, true),
    [resolved.otherSections]
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    return filterVariablesByQuery(resolved.allVariables, query);
  }, [query, resolved.allVariables]);

  const showStelliumHint =
    resolved.primarySections.some((s) => s.meta.id === "stellium") ||
    resolved.otherSections.some((s) => s.meta.id === "stellium");

  return (
    <div className="space-y-1.5" onMouseDownCapture={onMouseDownCapture}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer les variables…"
          className="h-7 pl-7 text-[11px]"
        />
      </div>

      {searchResults != null ? (
        <div className="flex flex-wrap gap-1">
          {searchResults.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">Aucune variable.</p>
          ) : (
            searchResults.map((v) => (
              <VariableChip key={v.token} variable={v} groupId={v.group} onInsert={onInsert} />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {primaryDisplay.map((section) => (
            <VariableGroupRow key={section.id} section={section} onInsert={onInsert} />
          ))}

          {otherDisplay.length > 0 && (
            <>
              <p className="pt-0.5 text-[10px] font-medium text-muted-foreground/80">
                Autres (hors contexte du modèle)
              </p>
              {otherDisplay.map((section) => (
                <VariableGroupRow key={section.id} section={section} onInsert={onInsert} />
              ))}
            </>
          )}
        </div>
      )}

      <p className="text-[10px] leading-tight text-muted-foreground">
        Clic → corps · obj → objet · survol = token
        {showStelliumHint ? " · Stellium : chiffres à la préparation" : ""}
      </p>
    </div>
  );
}
