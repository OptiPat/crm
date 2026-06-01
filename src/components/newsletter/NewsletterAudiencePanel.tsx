import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Users } from "lucide-react";
import {
  getNewsletterAudienceMembers,
  type NewsletterAudienceFilters,
  type NewsletterAudienceMember,
  type NewsletterAudiencePreview,
} from "@/lib/api/tauri-newsletter";
import {
  getClientCategorieLabel,
  getFilleulCategorieLabel,
} from "@/lib/contacts/contact-list-labels";
import {
  computeNewsletterAudiencePreview,
  isNewsletterMemberSelectable,
  isNewsletterMemberSelected,
  setNewsletterMembersSelection,
  toggleNewsletterMemberSelection,
} from "@/lib/newsletter/newsletter-audience-utils";
import { textMatchesSearch } from "@/lib/search-utils";
import { cn } from "@/lib/utils";

type NewsletterAudiencePanelProps = {
  filters: NewsletterAudienceFilters;
  onFiltersChange: (next: NewsletterAudienceFilters) => void;
  onOpenContact?: (contactId: number) => void;
  onPreviewChange?: (preview: NewsletterAudiencePreview | null) => void;
};

function memberCategoryLabel(member: NewsletterAudienceMember): string | null {
  if (member.categorie === "PRESCRIPTEUR") return "Prescripteur";
  const filleulLabel =
    member.filleulCategorie ? getFilleulCategorieLabel(member.filleulCategorie) : null;
  return filleulLabel ?? getClientCategorieLabel(member.categorie);
}

export function NewsletterAudiencePanel({
  filters,
  onFiltersChange,
  onOpenContact,
  onPreviewChange,
}: NewsletterAudiencePanelProps) {
  const [members, setMembers] = useState<NewsletterAudienceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getNewsletterAudienceMembers();
      setMembers(rows);
    } catch (e) {
      console.error(e);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const preview = useMemo(
    () => (members.length > 0 ? computeNewsletterAudiencePreview(members, filters) : null),
    [members, filters]
  );

  useEffect(() => {
    onPreviewChange?.(preview);
  }, [preview, onPreviewChange]);

  const filteredMembers = useMemo(
    () =>
      members.filter((m) =>
        textMatchesSearch(
          searchQuery,
          m.nom,
          m.prenom,
          m.email,
          memberCategoryLabel(m)
        )
      ),
    [members, searchQuery]
  );

  const filteredSelectable = useMemo(
    () => filteredMembers.filter(isNewsletterMemberSelectable),
    [filteredMembers]
  );

  const toggleMember = (member: NewsletterAudienceMember, selected: boolean) => {
    onFiltersChange({
      ...filters,
      excludeContactIds: toggleNewsletterMemberSelection(
        member,
        filters.excludeContactIds,
        selected
      ),
    });
  };

  const setFilteredSelection = (selected: boolean) => {
    onFiltersChange({
      ...filters,
      excludeContactIds: setNewsletterMembersSelection(
        filteredSelectable,
        filters.excludeContactIds,
        selected
      ),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Destinataires</CardTitle>
        <CardDescription>
          Tous vos contacts sont listés ci-dessous. Par défaut, tous ceux avec un email sont
          cochés, sauf les désinscrits newsletter. Décochez manuellement ceux à exclure de
          cette édition.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ?
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement des contacts…
          </p>
        : preview ?
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="default" className="font-normal">
                {preview.eligible} sélectionné{preview.eligible !== 1 ? "s" : ""}
              </Badge>
              {preview.excludedByFilters > 0 && (
                <Badge variant="outline" className="font-normal">
                  {preview.excludedByFilters} exclu{preview.excludedByFilters !== 1 ? "s" : ""}{" "}
                  manuellement
                </Badge>
              )}
              {preview.permanentExcluded > 0 && (
                <Badge variant="outline" className="font-normal">
                  {preview.permanentExcluded} désinscrit{preview.permanentExcluded !== 1 ? "s" : ""}
                </Badge>
              )}
              {preview.withoutEmail > 0 && (
                <Badge variant="secondary" className="font-normal">
                  {preview.withoutEmail} sans email
                </Badge>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher nom, email, catégorie…"
                  className="pl-9"
                  aria-label="Rechercher un destinataire"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filteredSelectable.length === 0}
                  onClick={() => setFilteredSelection(true)}
                >
                  Tout cocher
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={filteredSelectable.length === 0}
                  onClick={() => setFilteredSelection(false)}
                >
                  Tout décocher
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {filteredMembers.length} contact{filteredMembers.length !== 1 ? "s" : ""}
                {searchQuery.trim() ? " (recherche)" : ""}
              </p>

              {filteredMembers.length === 0 ?
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Aucun contact pour cette recherche.
                </p>
              : <ul className="text-sm border rounded-md divide-y max-h-80 overflow-y-auto bg-muted/10">
                  {filteredMembers.map((member) => {
                    const selectable = isNewsletterMemberSelectable(member);
                    const selected = isNewsletterMemberSelected(
                      member,
                      filters.excludeContactIds
                    );
                    const categoryLabel = memberCategoryLabel(member);
                    const checkboxId = `nl-recipient-${member.contactId}`;

                    return (
                      <li
                        key={member.contactId}
                        className={cn(
                          "flex items-start gap-3 px-3 py-2.5",
                          !selectable && "opacity-60"
                        )}
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={selected}
                          disabled={!selectable}
                          onCheckedChange={(v) => toggleMember(member, v === true)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <Label
                            htmlFor={checkboxId}
                            className={cn(
                              "font-medium leading-snug",
                              selectable ? "cursor-pointer" : "cursor-default"
                            )}
                          >
                            {member.prenom} {member.nom}
                          </Label>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            {member.email ?
                              <span className="text-muted-foreground text-xs truncate">
                                {member.email}
                              </span>
                            : <span className="text-muted-foreground text-xs italic">
                                Sans email
                              </span>
                            }
                            {categoryLabel ?
                              <span className="text-muted-foreground text-xs">
                                — {categoryLabel}
                              </span>
                            : null}
                            {member.unsubscribed ?
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                                Désinscrit
                              </Badge>
                            : null}
                          </div>
                        </div>
                        {onOpenContact ?
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0 h-7 px-2 text-xs"
                            onClick={() => onOpenContact(member.contactId)}
                          >
                            Fiche
                          </Button>
                        : null}
                      </li>
                    );
                  })}
                </ul>
              }
            </div>
          </>
        : null}
      </CardContent>
    </Card>
  );
}

export function newsletterChecklistOk(input: {
  preview: NewsletterAudiencePreview | null;
  emailConnected: boolean;
  hasContent: boolean;
}): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  if (!input.hasContent) messages.push("Générez ou saisissez le contenu");
  if (!input.emailConnected) messages.push("Connectez Gmail (Paramètres → Email)");
  if (!input.preview || input.preview.eligible === 0) {
    messages.push("Aucun destinataire sélectionné");
  }
  return { ok: messages.length === 0, messages };
}
