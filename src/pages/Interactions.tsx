import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Trash2, Pencil, Phone, Mail, Calendar, FileText } from "lucide-react";
import {
  getAllInteractionsWithContacts,
  deleteInteraction,
  INTERACTION_TYPES,
  type InteractionWithContact,
} from "@/lib/api/tauri-interactions";
import { InteractionForm } from "@/components/interactions/InteractionForm";
import { textMatchesSearch } from "@/lib/search-utils";

const TYPE_ICONS: Record<string, typeof Phone> = {
  APPEL: Phone,
  EMAIL: Mail,
  RDV: Calendar,
  NOTE: FileText,
  AUTRE: FileText,
};

function getTypeLabel(value: string): string {
  return INTERACTION_TYPES.find((t) => t.value === value)?.label || value;
}

export function Interactions() {
  const [items, setItems] = useState<InteractionWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InteractionWithContact | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const data = await getAllInteractionsWithContacts();
      setItems(data);
    } catch (error) {
      console.error(error);
      setLoadError(String(error));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesType =
        typeFilter === "ALL" || item.type_interaction === typeFilter;
      const matchesSearch =
        textMatchesSearch(
          searchQuery,
          item.contact_nom,
          item.contact_prenom,
          item.sujet,
          item.contenu,
          getTypeLabel(item.type_interaction)
        );
      return matchesType && matchesSearch;
    });
  }, [items, searchQuery, typeFilter]);

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cette interaction ?")) return;
    try {
      await deleteInteraction(id);
      await load();
    } catch (error) {
      alert("Erreur : " + String(error));
    }
  };

  const formatDate = (ts: number) => {
    try {
      return new Date(ts * 1000).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Interactions
          </h2>
          <p className="text-muted-foreground">
            Historique des échanges avec vos contacts
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nouvelle interaction
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
          <CardDescription>
            {filtered.length} interaction{filtered.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher contact, sujet, contenu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les types</SelectItem>
                {INTERACTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadError ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-destructive text-sm">{loadError}</p>
              <Button variant="outline" onClick={load}>
                Réessayer
              </Button>
            </div>
          ) : loading ? (
            <p className="text-muted-foreground text-center py-8">Chargement…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {items.length === 0
                  ? "Aucune interaction enregistrée"
                  : "Aucun résultat pour cette recherche"}
              </p>
              <Button
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle interaction
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => {
                const Icon = TYPE_ICONS[item.type_interaction] || FileText;
                return (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 p-4 border rounded-lg hover:bg-muted/40"
                  >
                    <div className="flex gap-3 min-w-0">
                      <div className="p-2 bg-muted rounded-lg shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium">
                            {item.contact_prenom} {item.contact_nom}
                          </span>
                          <Badge variant="outline">{getTypeLabel(item.type_interaction)}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(item.date_interaction)}
                          </span>
                        </div>
                        {item.sujet && (
                          <p className="text-sm font-medium">{item.sujet}</p>
                        )}
                        {item.contenu && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {item.contenu}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(item);
                          setShowForm(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <InteractionForm
        open={showForm}
        onOpenChange={setShowForm}
        interaction={editing}
        onSuccess={load}
      />
    </div>
  );
}
