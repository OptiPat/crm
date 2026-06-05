import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  Users,
  Wallet,
  House,
  Handshake,
  FileText,
  LucideIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { textMatchesSearch } from "@/lib/search-utils";
import {
  navigateAppPage,
  requestOpenContact,
} from "@/lib/navigation/app-navigation";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import {
  getInvestissementsWithDetails,
  type InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import { getAllPartenaires, type Partenaire } from "@/lib/api/tauri-partenaires";
import { getAllDocuments, type Document } from "@/lib/api/tauri-documents";

const MAX_PER_GROUP = 6;

interface GlobalSearchProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

interface SearchData {
  contacts: Contact[];
  investissements: InvestissementWithDetails[];
  foyers: Foyer[];
  partenaires: Partenaire[];
  documents: Document[];
}

interface SearchResult {
  key: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  onSelect: () => void;
}

const EMPTY_DATA: SearchData = {
  contacts: [],
  investissements: [],
  foyers: [],
  partenaires: [],
  documents: [],
};

export function GlobalSearch({ currentPage, onPageChange }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contacts, investissements, foyers, partenaires, documents] =
        await Promise.all([
          getAllContacts(),
          getInvestissementsWithDetails(),
          getAllFoyers(),
          getAllPartenaires(),
          getAllDocuments(),
        ]);
      setData({ contacts, investissements, foyers, partenaires, documents });
    } catch (error) {
      console.error("Erreur recherche globale:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadData();
  }, [open, loadData]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const contactsById = useMemo(() => {
    const map = new Map<number, Contact>();
    for (const c of data.contacts) map.set(c.id, c);
    return map;
  }, [data.contacts]);

  const groups = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return [] as { label: string; results: SearchResult[] }[];
    }

    const contactResults: SearchResult[] = data.contacts
      .filter((c) =>
        textMatchesSearch(q, c.nom, c.prenom, c.email, c.telephone, c.ville)
      )
      .slice(0, MAX_PER_GROUP)
      .map((c) => ({
        key: `contact-${c.id}`,
        label: `${c.prenom} ${c.nom}`.trim(),
        sublabel: [c.email, c.ville].filter(Boolean).join(" · ") || undefined,
        icon: Users,
        onSelect: () => {
          requestOpenContact(c.id, {
            currentPage,
            setCurrentPage: onPageChange,
          });
          close();
        },
      }));

    const investissementResults: SearchResult[] = data.investissements
      .filter((inv) =>
        textMatchesSearch(
          q,
          inv.nom_produit,
          inv.type_produit,
          inv.contact_nom,
          inv.contact_prenom,
          inv.foyer_nom,
          inv.partenaire_nom
        )
      )
      .slice(0, MAX_PER_GROUP)
      .map((inv) => {
        const proprietaire =
          inv.foyer_nom ||
          `${inv.contact_prenom} ${inv.contact_nom}`.trim() ||
          undefined;
        return {
          key: `investissement-${inv.id}`,
          label: inv.nom_produit,
          sublabel: [inv.type_produit, proprietaire]
            .filter(Boolean)
            .join(" · "),
          icon: Wallet,
          onSelect: () => {
            if (inv.contact_id != null) {
              requestOpenContact(inv.contact_id, {
                tab: "patrimoine",
                currentPage,
                setCurrentPage: onPageChange,
              });
            } else {
              navigateAppPage(currentPage, onPageChange, "investissements");
            }
            close();
          },
        };
      });

    const foyerResults: SearchResult[] = data.foyers
      .filter((f) => textMatchesSearch(q, f.nom, f.type_foyer))
      .slice(0, MAX_PER_GROUP)
      .map((f) => ({
        key: `foyer-${f.id}`,
        label: f.nom,
        sublabel: f.type_foyer || undefined,
        icon: House,
        onSelect: () => {
          navigateAppPage(currentPage, onPageChange, "foyers");
          close();
        },
      }));

    const partenaireResults: SearchResult[] = data.partenaires
      .filter((p) =>
        textMatchesSearch(
          q,
          p.raison_sociale,
          p.nom_contact,
          p.prenom_contact,
          p.email,
          p.ville,
          p.specialite
        )
      )
      .slice(0, MAX_PER_GROUP)
      .map((p) => ({
        key: `partenaire-${p.id}`,
        label: p.raison_sociale,
        sublabel: [p.type_partenaire, p.ville].filter(Boolean).join(" · ") || undefined,
        icon: Handshake,
        onSelect: () => {
          navigateAppPage(currentPage, onPageChange, "partenaires");
          close();
        },
      }));

    const documentResults: SearchResult[] = data.documents
      .filter((d) => {
        const client = d.contact_id ? contactsById.get(d.contact_id) : undefined;
        const clientLabel = client ? `${client.prenom} ${client.nom}` : "";
        return textMatchesSearch(q, d.nom_fichier, d.type_document, clientLabel);
      })
      .slice(0, MAX_PER_GROUP)
      .map((d) => {
        const client = d.contact_id ? contactsById.get(d.contact_id) : undefined;
        const clientLabel = client
          ? `${client.prenom} ${client.nom}`.trim()
          : undefined;
        return {
          key: `document-${d.id}`,
          label: d.nom_fichier,
          sublabel: [d.type_document, clientLabel].filter(Boolean).join(" · "),
          icon: FileText,
          onSelect: () => {
            if (d.contact_id != null) {
              requestOpenContact(d.contact_id, {
                currentPage,
                setCurrentPage: onPageChange,
              });
            } else {
              navigateAppPage(currentPage, onPageChange, "documents");
            }
            close();
          },
        };
      });

    return [
      { label: "Contacts", results: contactResults },
      { label: "Investissements", results: investissementResults },
      { label: "Foyers", results: foyerResults },
      { label: "Partenaires", results: partenaireResults },
      { label: "Documents", results: documentResults },
    ].filter((g) => g.results.length > 0);
  }, [query, data, contactsById, currentPage, onPageChange, close]);

  const hasResults = groups.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted min-w-[220px]"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Rechercher…</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={(value) => (value ? setOpen(true) : close())}
        shouldFilter={false}
      >
        <CommandInput
          placeholder="Rechercher un contact, investissement, foyer, partenaire, document…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!query.trim() ? (
            <CommandEmpty>
              {loading ? "Chargement…" : "Tapez pour rechercher."}
            </CommandEmpty>
          ) : !hasResults ? (
            <CommandEmpty>
              {loading ? "Chargement…" : "Aucun résultat."}
            </CommandEmpty>
          ) : null}

          {groups.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.results.map((result) => {
                const Icon = result.icon;
                return (
                  <CommandItem
                    key={result.key}
                    value={result.key}
                    onSelect={result.onSelect}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{result.label}</span>
                      {result.sublabel ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {result.sublabel}
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
