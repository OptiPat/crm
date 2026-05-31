import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/dashboard/StatCard";
import { Plus, Search, Filter, Trash2, Pencil, PiggyBank, TrendingUp, Wallet, Download } from "lucide-react";
import { rowsToCsv, downloadCsvFile } from "@/lib/export/csv-export";
import {
  getInvestissementsWithDetails,
  deleteInvestissement,
  type InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import { InvestissementForm } from "@/components/investissements/InvestissementForm";
import { InvestissementCard } from "@/components/investissements/InvestissementCard";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  computePatrimoineStats,
  type PatrimoineOrigineFilter,
} from "@/lib/investissements/patrimoine-tab-utils";
import { textMatchesSearch } from "@/lib/search-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type InvestissementsProps = {
  onOpenContact?: (contactId: number) => void;
};

function OrigineFilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/80 bg-card text-muted-foreground hover:bg-muted/50"
      )}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className={cn(
            "tabular-nums rounded-full px-1.5 py-0.5 text-[10px]",
            active ? "bg-primary/15" : "bg-muted"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function Investissements({ onOpenContact }: InvestissementsProps) {
  const [investissements, setInvestissements] = useState<InvestissementWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [origineFilter, setOrigineFilter] = useState<PatrimoineOrigineFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [partenaireFilter, setPartenaireFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [selectedInvestissement, setSelectedInvestissement] = useState<InvestissementWithDetails | null>(null);

  useEffect(() => {
    loadInvestissements();
  }, []);

  const loadInvestissements = async () => {
    try {
      const data = await getInvestissementsWithDetails();
      setInvestissements(data);
    } catch (error) {
      console.error("Error loading investissements:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet investissement ?")) {
      return;
    }

    try {
      await deleteInvestissement(id);
      await loadInvestissements();
    } catch (error) {
      console.error("Error deleting investissement:", error);
      alert("Erreur lors de la suppression: " + String(error));
    }
  };

  const stats = useMemo(
    () => computePatrimoineStats(investissements),
    [investissements]
  );

  const countByOrigine = useMemo(
    () => ({
      all: investissements.length,
      avec_moi: investissements.filter((i) => i.origine === "MON_CONSEIL").length,
      a_cote: investissements.filter((i) => i.origine !== "MON_CONSEIL").length,
    }),
    [investissements]
  );

  const filteredInvestissements = useMemo(() => {
    let list = investissements;
    if (origineFilter === "avec_moi") {
      list = list.filter((i) => i.origine === "MON_CONSEIL");
    } else if (origineFilter === "a_cote") {
      list = list.filter((i) => i.origine !== "MON_CONSEIL");
    }

    list = list.filter((inv) => {
      const matchesSearch = textMatchesSearch(
        searchQuery,
        inv.nom_produit,
        inv.contact_nom,
        inv.contact_prenom,
        inv.partenaire_nom
      );
      const matchesType = typeFilter === "ALL" || inv.type_produit === typeFilter;
      const matchesPartenaire =
        partenaireFilter === "ALL" || inv.partenaire_nom === partenaireFilter;
      return matchesSearch && matchesType && matchesPartenaire;
    });

    return list.sort((a, b) => {
      if (!a.date_souscription) return 1;
      if (!b.date_souscription) return -1;
      return b.date_souscription - a.date_souscription;
    });
  }, [investissements, origineFilter, searchQuery, typeFilter, partenaireFilter]);

  const filteredTotalCentimes = filteredInvestissements.reduce(
    (s, i) => s + (i.montant_initial ?? 0),
    0
  );

  const hasActiveFilters =
    origineFilter !== "all" ||
    searchQuery.trim() !== "" ||
    typeFilter !== "ALL" ||
    partenaireFilter !== "ALL";

  const resetFilters = () => {
    setOrigineFilter("all");
    setSearchQuery("");
    setTypeFilter("ALL");
    setPartenaireFilter("ALL");
  };

  const handleExportCsv = () => {
    const headers = [
      "Produit",
      "Type",
      "Montant (€)",
      "Client prénom",
      "Client nom",
      "ID contact",
      "Foyer",
      "Partenaire",
      "Origine",
      "Date souscription",
      "Fin démembrement",
      "Notes",
    ];
    const rows = filteredInvestissements.map((inv) => [
      inv.nom_produit,
      inv.type_produit,
      ((inv.montant_initial ?? 0) / 100).toFixed(2),
      inv.contact_id ? inv.contact_prenom : "Commun",
      inv.contact_id ? inv.contact_nom : inv.foyer_nom ?? "",
      inv.contact_id ?? "",
      inv.foyer_nom ?? "",
      inv.partenaire_nom ?? "",
      inv.origine === "MON_CONSEIL" ? "Avec moi" : "À côté",
      inv.date_souscription
        ? new Date(inv.date_souscription * 1000).toLocaleDateString("fr-FR")
        : "",
      inv.date_fin_demembrement
        ? new Date(inv.date_fin_demembrement * 1000).toLocaleDateString("fr-FR")
        : "",
      inv.notes ?? "",
    ]);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsvFile(
      `investissements_${date}.csv`,
      rowsToCsv(headers, rows)
    );
    toast.success(`${filteredInvestissements.length} ligne(s) exportée(s)`);
  };

  const uniquePartenaires = Array.from(
    new Set(investissements.map((inv) => inv.partenaire_nom).filter(Boolean))
  ).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Investissements
          </h2>
          <p className="text-muted-foreground">
            Vue portefeuille — tous les clients
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {filteredInvestissements.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              Exporter CSV
            </Button>
          )}
          <Button className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nouvel investissement
          </Button>
        </div>
      </div>

      <section className="space-y-2" aria-label="Synthèse du portefeuille">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Synthèse — clic sur une carte pour filtrer la liste
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            title="Avec moi"
            value={formatEuroCentimes(stats.avecMoiCentimes)}
            description={`${stats.countAvecMoi} support${stats.countAvecMoi > 1 ? "s" : ""} — conseil`}
            icon={TrendingUp}
            accentColor="#dc216e"
            iconColor="text-rose-700"
            iconBgColor="bg-rose-50"
            highlight={origineFilter === "avec_moi"}
            onClick={() =>
              setOrigineFilter((f) => (f === "avec_moi" ? "all" : "avec_moi"))
            }
          />
          <StatCard
            title="À côté"
            value={formatEuroCentimes(stats.aCoteCentimes)}
            description={`${stats.countACote} support${stats.countACote > 1 ? "s" : ""} — hors conseil`}
            icon={PiggyBank}
            accentColor="#6b7280"
            iconColor="text-gray-600"
            iconBgColor="bg-gray-50"
            highlight={origineFilter === "a_cote"}
            onClick={() =>
              setOrigineFilter((f) => (f === "a_cote" ? "all" : "a_cote"))
            }
          />
          <StatCard
            title="Total portefeuille"
            value={formatEuroCentimes(stats.totalCentimes)}
            description={`${stats.count} ligne${stats.count > 1 ? "s" : ""} en base`}
            icon={Wallet}
            accentColor="#047857"
            iconColor="text-emerald-700"
            iconBgColor="bg-emerald-50"
            onClick={resetFilters}
            highlight={!hasActiveFilters && origineFilter === "all"}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Liste des investissements</CardTitle>
                <CardDescription>
                  Cliquez sur une ligne (ou sur le nom du client) pour ouvrir la fiche
                  Contacts → onglet Patrimoine
                </CardDescription>
              </div>
              {!loading && investissements.length > 0 && (
                <p className="text-sm font-medium text-foreground tabular-nums shrink-0">
                  {filteredInvestissements.length} / {investissements.length}
                  <span className="text-muted-foreground font-normal ml-2">
                    {formatEuroCentimes(filteredTotalCentimes)}
                  </span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <OrigineFilterPill
                active={origineFilter === "all"}
                label="Tous"
                count={countByOrigine.all}
                onClick={() => setOrigineFilter("all")}
              />
              <OrigineFilterPill
                active={origineFilter === "avec_moi"}
                label="Avec moi"
                count={countByOrigine.avec_moi}
                onClick={() => setOrigineFilter("avec_moi")}
              />
              <OrigineFilterPill
                active={origineFilter === "a_cote"}
                label="À côté"
                count={countByOrigine.a_cote}
                onClick={() => setOrigineFilter("a_cote")}
              />
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={resetFilters}
                >
                  Réinitialiser
                </Button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par produit, client, partenaire..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-4 w-4 mr-2 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous les types</SelectItem>
                  <SelectItem value="SCPI">SCPI</SelectItem>
                  <SelectItem value="SCPI_DEMEMBREMENT">SCPI Démembrement</SelectItem>
                  <SelectItem value="ASSURANCE_VIE">Assurance Vie</SelectItem>
                  <SelectItem value="PER">PER</SelectItem>
                  <SelectItem value="IMMOBILIER">Immobilier</SelectItem>
                  <SelectItem value="FIP_FCPI">FIP/FCPI</SelectItem>
                  <SelectItem value="FCPR">FCPR</SelectItem>
                  <SelectItem value="G3F">G3F</SelectItem>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectContent>
              </Select>

              {uniquePartenaires.length > 0 && (
                <Select value={partenaireFilter} onValueChange={setPartenaireFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <Filter className="h-4 w-4 mr-2 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tous les partenaires</SelectItem>
                    {uniquePartenaires.map((partenaire) => (
                      <SelectItem key={partenaire} value={partenaire || ""}>
                        {partenaire}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : investissements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun investissement. Commencez par en créer un !
            </div>
          ) : filteredInvestissements.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                Aucun investissement pour ces filtres.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                Tout afficher
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInvestissements.map((inv) => {
                const ownerLabel = inv.foyer_nom
                  ? inv.foyer_nom
                  : [inv.contact_prenom, inv.contact_nom]
                      .filter(Boolean)
                      .join(" ")
                      .trim();
                const openContactPatrimoine = () => {
                  if (!onOpenContact) {
                    toast.error("Navigation vers la fiche contact indisponible");
                    return;
                  }
                  const contactId = inv.contact_id;
                  if (contactId == null || contactId <= 0) {
                    toast.error(
                      "Ce placement n’est pas lié à un contact — impossible d’ouvrir la fiche"
                    );
                    return;
                  }
                  onOpenContact(contactId);
                };

                return (
                  <InvestissementCard
                    key={inv.id}
                    inv={inv}
                    partenaireNom={inv.partenaire_nom}
                    proprietaireLabel={ownerLabel || undefined}
                    proprietaireVariant={inv.foyer_id ? "foyer" : "member"}
                    onOpenContactClick={
                      onOpenContact ? openContactPatrimoine : undefined
                    }
                    actions={
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedInvestissement(inv);
                            setShowForm(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(inv.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <InvestissementForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) {
            setSelectedInvestissement(null);
          }
        }}
        onSuccess={loadInvestissements}
        investissement={selectedInvestissement}
      />
    </div>
  );
}
