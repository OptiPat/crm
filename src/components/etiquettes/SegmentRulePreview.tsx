import { useEffect, useMemo, useState } from "react";
import { Users, Loader2 } from "lucide-react";
import { getContactsMatchingRuleJson } from "@/lib/api/tauri-segments";
import type { Contact } from "@/lib/api/tauri-contacts";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getClientLabel, getFilleulLabel } from "@/lib/contacts/contact-form-utils";
import { compareContactsAlphabetically } from "@/lib/contacts/contact-sort";
import {
  buildRuleTree,
  stringifyRuleTree,
  type RuleLeaf,
  type RuleOp,
} from "@/lib/etiquettes/rule-ast";

const LIST_MAX_HEIGHT_CLASS = "max-h-52";

function contactSubtitle(contact: Contact): string {
  return [
    getFilleulLabel(contact.filleul_categorie),
    getClientLabel(contact.categorie),
    contact.email?.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function SegmentRulePreview({
  op,
  children,
  ruleJson,
  debounceMs = 400,
  listTitle = "Contacts concernés par la règle",
  selectable = false,
  excludedContactIds = [],
  onExcludedContactIdsChange,
}: {
  op?: RuleOp;
  children?: RuleLeaf[];
  ruleJson?: string;
  debounceMs?: number;
  listTitle?: string;
  selectable?: boolean;
  excludedContactIds?: number[];
  onExcludedContactIdsChange?: (ids: number[]) => void;
}) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  const payload =
    ruleJson ??
    (children && children.length > 0
      ? stringifyRuleTree(buildRuleTree(children, op ?? "and"))
      : null);

  const excludedSet = useMemo(() => new Set(excludedContactIds), [excludedContactIds]);

  useEffect(() => {
    if (!payload) {
      setContacts(null);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    const t = window.setTimeout(() => {
      getContactsMatchingRuleJson(payload)
        .then((rows) => {
          setContacts([...rows].sort(compareContactsAlphabetically));
          setError(false);
        })
        .catch(() => {
          setContacts(null);
          setError(true);
        })
        .finally(() => setLoading(false));
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [payload, debounceMs]);

  const list = useMemo(() => contacts ?? [], [contacts]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((contact) => {
      const hay = `${contact.prenom} ${contact.nom} ${contact.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [list, search]);

  const eligibleCount = useMemo(
    () => list.filter((c) => !excludedSet.has(c.id)).length,
    [list, excludedSet]
  );

  const toggleExcluded = (contactId: number, included: boolean) => {
    if (!onExcludedContactIdsChange) return;
    if (included) {
      onExcludedContactIdsChange(excludedContactIds.filter((id) => id !== contactId));
    } else {
      onExcludedContactIdsChange([...excludedContactIds, contactId]);
    }
  };

  if (!payload) return null;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        ) : (
          <Users className="h-4 w-4 shrink-0 text-primary" />
        )}
        {loading ? (
          "Calcul des contacts concernés…"
        ) : error ? (
          "Aperçu indisponible"
        ) : list.length > 0 ? (
          selectable ? (
            <>
              <span className="font-medium text-foreground tabular-nums">{eligibleCount}</span>
              contact{eligibleCount !== 1 ? "s" : ""} inclus
              {excludedSet.size > 0 ? (
                <Badge variant="outline" className="text-xs">
                  {excludedSet.size} exclu{excludedSet.size > 1 ? "s" : ""}
                </Badge>
              ) : null}
              <span className="text-muted-foreground">
                ({list.length} correspondant{list.length > 1 ? "s" : ""} à la règle)
              </span>
            </>
          ) : (
            <>
              <span className="font-medium text-foreground tabular-nums">{list.length}</span>
              contact{list.length !== 1 ? "s" : ""} correspondant{list.length !== 1 ? "s" : ""} à
              cette règle
            </>
          )
        ) : (
          "Aucun contact ne correspond pour l'instant"
        )}
      </p>

      {selectable ? (
        <p className="text-xs text-muted-foreground">
          Décochez un contact pour l&apos;exclure de ce déclencheur. Enregistrez le modèle pour
          appliquer — la file Suivi → Envois sera mise à jour.
        </p>
      ) : null}

      {selectable && list.length > 0 ? (
        <Input
          placeholder="Filtrer nom, prénom, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm bg-background"
        />
      ) : null}

      {!loading && !error && filteredList.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">{listTitle}</p>
          <ul
            className={`overflow-y-auto rounded-md border bg-background/80 divide-y divide-border/60 ${LIST_MAX_HEIGHT_CLASS}`}
          >
            {filteredList.map((contact) => {
              const label =
                `${contact.prenom} ${contact.nom}`.trim() || `Contact #${contact.id}`;
              const subtitle = contactSubtitle(contact);
              const included = !excludedSet.has(contact.id);

              if (selectable) {
                return (
                  <li key={contact.id}>
                    <label className="flex items-start gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={included}
                        onCheckedChange={(checked) =>
                          toggleExcluded(contact.id, checked === true)
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-foreground truncate block">
                          {label}
                        </span>
                        {subtitle ? (
                          <span className="text-xs text-muted-foreground truncate block">
                            {subtitle}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              }

              return (
                <li key={contact.id} className="px-3 py-2 text-sm">
                  <p className="font-medium text-foreground truncate">{label}</p>
                  {subtitle ? (
                    <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {selectable && !loading && !error && list.length > 0 && filteredList.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun contact pour cette recherche.</p>
      ) : null}
    </div>
  );
}
