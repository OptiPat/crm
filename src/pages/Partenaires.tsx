import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Plus, Search, Building2, Shield, Wallet, Filter, X } from "lucide-react";
import {
  getAllPartenaires,
  deletePartenaire,
  type Partenaire,
} from "@/lib/api/tauri-partenaires";
import { getAllInvestissements } from "@/lib/api/tauri-investissements";
import { PartenaireForm } from "@/components/partenaires/PartenaireForm";
import { PartenaireDetail } from "@/components/partenaires/PartenaireDetail";
import {
  PartenaireSummaryCard,
  type PartenaireListMeta,
} from "@/components/partenaires/PartenaireSummaryCard";
import {
  getPartenaireTypeInfo,
  PARTENAIRE_TYPE_FILTER_OPTIONS,
} from "@/lib/partenaires/partenaire-display";
import { StatCard } from "@/components/dashboard/StatCard";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { textMatchesSearch } from "@/lib/search-utils";
import { useAppAutoRefresh } from "@/hooks/useAppAutoRefresh";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

export function Partenaires() {
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [metaParId, setMetaParId] = useState<Record<number, PartenaireListMeta>>({});
  const [totalProduitsLies, setTotalProduitsLies] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [selectedPartenaireId, setSelectedPartenaireId] = useState<number | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const isWideLayout = useMediaQuery("(min-width: 1024px)");
  const showSplit = isWideLayout && selectedPartenaireId != null;

  const loadPartenaires = useCallback(async () => {
    try {
      const [data, investissements] = await Promise.all([
        getAllPartenaires(),
        getAllInvestissements(),
      ]);

      const meta: Record<number, PartenaireListMeta> = {};
      let produits = 0;

      for (const inv of investissements) {
        if (!inv.partenaire_id) continue;
        produits += 1;
        if (!meta[inv.partenaire_id]) {
          meta[inv.partenaire_id] = { investissementCount: 0, patrimoineAvecMoi: 0 };
        }
        meta[inv.partenaire_id].investissementCount += 1;
        if (inv.origine === "MON_CONSEIL") {
          meta[inv.partenaire_id].patrimoineAvecMoi += inv.montant_initial || 0;
        }
      }

      setPartenaires(data);
      setMetaParId(meta);
      setTotalProduitsLies(produits);
      setSelectedPartenaireId((prev) =>
        prev != null && data.some((p) => p.id === prev) ? prev : null
      );
    } catch (error) {
      console.error("Error loading partenaires:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPartenaires();
  }, [loadPartenaires]);

  useAppAutoRefresh(() => {
    void loadPartenaires();
  });

  const filteredPartenaires = useMemo(() => {
    return partenaires.filter((partenaire) => {
      const matchesSearch = textMatchesSearch(
        searchQuery,
        partenaire.raison_sociale,
        partenaire.nom_contact,
        partenaire.prenom_contact,
        partenaire.email,
        partenaire.telephone,
        partenaire.ville
      );
      const matchesType =
        typeFilter === "ALL" ||
        partenaire.type_partenaire === typeFilter ||
        (typeFilter === "SOCIETE_GESTION_SCPI" &&
          partenaire.type_partenaire === "SOCIETE_GESTION");
      return matchesSearch && matchesType;
    });
  }, [partenaires, searchQuery, typeFilter]);

  const selectedPartenaire = useMemo(
    () =>
      selectedPartenaireId != null
        ? (partenaires.find((p) => p.id === selectedPartenaireId) ?? null)
        : null,
    [partenaires, selectedPartenaireId]
  );

  const patrimoineViaPartenaires = useMemo(
    () => Object.values(metaParId).reduce((s, m) => s + m.patrimoineAvecMoi, 0),
    [metaParId]
  );

  const openPartenaire = (partenaire: Partenaire) => {
    setSelectedPartenaireId(partenaire.id);
    if (!isWideLayout) {
      setShowDetailModal(true);
    }
  };

  const closeDetail = () => {
    setSelectedPartenaireId(null);
    setShowDetailModal(false);
  };

  const handleDeletePartenaire = async (id: number) => {
    try {
      await deletePartenaire(id);
      if (selectedPartenaireId === id) {
        closeDetail();
      }
      await loadPartenaires();
    } catch (error) {
      console.error("Error deleting partenaire:", error);
      alert("Erreur lors de la suppression: " + String(error));
    }
  };

  const hasActiveFilters = searchQuery.trim() !== "" || typeFilter !== "ALL";

  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1600px] mx-auto pb-8 animate-pulse">
        <div className="h-20 rounded-lg bg-muted/50" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/50" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-6 mx-auto pb-8",
        showSplit ? "max-w-[1800px]" : "max-w-[1600px]"
      )}
    >
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground capitalize">{today}</p>
          <h2 className="text-3xl font-serif font-bold text-primary tracking-tight mt-1">
            Partenaires
          </h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Assureurs, sociétés de gestion et promoteurs — référentiels des produits clients, pas
            des contacts CRM.
          </p>
        </div>
        <Button className="gap-2 shadow-sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nouveau partenaire
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Partenaires"
          value={partenaires.length}
          description={`${filteredPartenaires.length} affiché(s) avec filtres`}
          icon={Building2}
          accentColor="#1d4ed8"
          iconColor="text-blue-700"
          iconBgColor="bg-blue-50"
        />
        <StatCard
          title="Produits liés"
          value={totalProduitsLies}
          description="Investissements clients rattachés"
          icon={Shield}
          accentColor="#6d28d9"
          iconColor="text-violet-700"
          iconBgColor="bg-violet-50"
        />
        <StatCard
          title="Encours « avec moi »"
          value={formatEuroCentimes(patrimoineViaPartenaires)}
          description="Via ces partenaires (origine conseil)"
          icon={Wallet}
          accentColor="#047857"
          iconColor="text-emerald-700"
          iconBgColor="bg-emerald-50"
        />
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
            <div>
              <CardTitle className="font-serif text-lg">Répertoire</CardTitle>
              <CardDescription>
                Cliquez sur un partenaire pour la fiche et les produits liés
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="relative flex-1 sm:min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Raison sociale, contact, e-mail…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                {searchQuery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery("")}
                    aria-label="Effacer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-4 w-4 mr-2 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTENAIRE_TYPE_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {hasActiveFilters && typeFilter !== "ALL" && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="secondary" className="gap-1 font-normal">
                {getPartenaireTypeInfo(typeFilter).label}
                <button
                  type="button"
                  className="ml-1 hover:text-foreground"
                  onClick={() => setTypeFilter("ALL")}
                  aria-label="Retirer filtre type"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          <div className={cn("grid gap-4 items-start", showSplit && "lg:grid-cols-2")}>
            <div
              className={cn(
                "space-y-2 min-w-0",
                showSplit && "lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1"
              )}
            >
              {showSplit && (
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide sticky top-0 bg-card z-10 py-2 px-1">
                  Partenaires ({filteredPartenaires.length})
                </p>
              )}

              {filteredPartenaires.length === 0 ? (
                <div className="py-14 text-center rounded-xl border border-dashed border-border/80 bg-muted/15">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground/35 mb-3" />
                  <p className="font-medium text-foreground/90">
                    {hasActiveFilters ? "Aucun partenaire trouvé" : "Aucun partenaire"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
                    {hasActiveFilters
                      ? "Affinez la recherche ou le filtre type."
                      : "Ajoutez assureurs, gestionnaires SCPI/FIP ou promoteurs."}
                  </p>
                  {!hasActiveFilters && (
                    <Button onClick={() => setShowForm(true)} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Ajouter un partenaire
                    </Button>
                  )}
                </div>
              ) : (
                filteredPartenaires.map((partenaire) => (
                  <PartenaireSummaryCard
                    key={partenaire.id}
                    partenaire={partenaire}
                    meta={metaParId[partenaire.id]}
                    compact={showSplit}
                    selected={selectedPartenaireId === partenaire.id}
                    onClick={() => openPartenaire(partenaire)}
                  />
                ))
              )}
            </div>

            {showSplit && selectedPartenaire && (
              <div className="hidden lg:block min-w-0 lg:sticky lg:top-4 self-start w-full">
                <PartenaireDetail
                  key={selectedPartenaire.id}
                  embedded
                  open
                  partenaire={selectedPartenaire}
                  onOpenChange={(open) => {
                    if (!open) closeDetail();
                  }}
                  onDelete={handleDeletePartenaire}
                  onUpdate={() => void loadPartenaires()}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <PartenaireForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={() => void loadPartenaires()}
      />

      {!isWideLayout && selectedPartenaire && (
        <PartenaireDetail
          key={selectedPartenaire.id}
          open={showDetailModal}
          onOpenChange={(open) => {
            setShowDetailModal(open);
            if (!open) setSelectedPartenaireId(null);
          }}
          partenaire={selectedPartenaire}
          onDelete={handleDeletePartenaire}
          onUpdate={() => void loadPartenaires()}
        />
      )}
    </div>
  );
}
