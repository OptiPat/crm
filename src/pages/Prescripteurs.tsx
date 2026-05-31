import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, ChevronDown, ChevronUp, Share2, TrendingUp, Plus, X, ArrowLeft } from "lucide-react";
import { getAllContacts, deleteContact, type Contact } from "@/lib/api/tauri-contacts";
import { ContactForm } from "@/components/contacts/ContactForm";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import { getAllInvestissements, type Investissement } from "@/lib/api/tauri-investissements";
import { indexInvestissementsByOwner } from "@/lib/investissements/bulk-patrimoine";
import { requestOpenContact } from "@/lib/navigation/app-navigation";
import {
  buildFoyersInfo,
  buildPrescripteurTree,
  computePrescripteursRacines,
  getContactDisplayName,
  matchesContactOrFoyer,
  type PrescripteurStats,
} from "@/lib/prescripteurs/prescripteur-tree";
import { PrescripteurSummaryCard } from "@/components/prescripteurs/PrescripteurSummaryCard";
import { PrescripteurTreeView } from "@/components/prescripteurs/PrescripteurTreeView";
import { StatCard } from "@/components/dashboard/StatCard";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { useAppAutoRefresh } from "@/hooks/useAppAutoRefresh";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

type PrescripteursProps = {
  onNavigate?: (page: string) => void;
};

export function Prescripteurs({ onNavigate }: PrescripteursProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissementsByContact, setInvestissementsByContact] = useState<
    Record<number, Investissement[]>
  >({});
  const [investissementsByFoyer, setInvestissementsByFoyer] = useState<
    Record<number, Investissement[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPrescripteurs, setExpandedPrescripteurs] = useState<Set<number>>(new Set());
  const [expandedInvestissements, setExpandedInvestissements] = useState<Set<number>>(
    new Set()
  );
  const [showPrescripteurForm, setShowPrescripteurForm] = useState(false);
  const [selectedPrescripteurId, setSelectedPrescripteurId] = useState<number | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDetail, setShowContactDetail] = useState(false);

  const isWideLayout = useMediaQuery("(min-width: 1024px)");
  const showSplit =
    isWideLayout && (selectedPrescripteurId != null || selectedContact != null);

  const loadData = useCallback(async () => {
    try {
      const dataContacts = await getAllContacts();
      setContacts(dataContacts);

      const allInv = await getAllInvestissements();
      const { byContactId, byFoyerId } = indexInvestissementsByOwner(allInv);
      const investsByContact: Record<number, Investissement[]> = {};
      const investsByFoyer: Record<number, Investissement[]> = {};
      for (const contact of dataContacts) {
        investsByContact[contact.id] = byContactId[contact.id] ?? [];
      }
      for (const contact of dataContacts) {
        if (contact.foyer_id != null && investsByFoyer[contact.foyer_id] == null) {
          investsByFoyer[contact.foyer_id] = byFoyerId[contact.foyer_id] ?? [];
        }
      }

      setInvestissementsByContact(investsByContact);
      setInvestissementsByFoyer(investsByFoyer);
      setSelectedContact((prev) => {
        if (!prev?.id) return prev;
        return dataContacts.find((c) => c.id === prev.id) ?? prev;
      });
      setSelectedPrescripteurId((prev) => {
        if (prev == null) return prev;
        return dataContacts.some((c) => c.id === prev) ? prev : null;
      });
    } catch (error) {
      console.error("Erreur chargement données:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useAppAutoRefresh(() => {
    void loadData();
  });

  const foyersInfo = useMemo(() => buildFoyersInfo(contacts), [contacts]);

  const prescripteursRacines = useMemo(
    () =>
      computePrescripteursRacines(
        contacts,
        investissementsByContact,
        investissementsByFoyer
      ),
    [contacts, investissementsByContact, investissementsByFoyer]
  );

  const filteredPrescripteurs = useMemo(() => {
    if (!searchQuery) return prescripteursRacines;
    return prescripteursRacines.filter((p) =>
      matchesContactOrFoyer(p.contact, searchQuery, foyersInfo)
    );
  }, [prescripteursRacines, searchQuery, foyersInfo]);

  const selectedStats = useMemo(
    () =>
      selectedPrescripteurId != null
        ? (prescripteursRacines.find((p) => p.contact.id === selectedPrescripteurId) ??
          null)
        : null,
    [prescripteursRacines, selectedPrescripteurId]
  );

  const treeContext = useMemo(
    () => ({
      contacts,
      investissementsByContact,
      investissementsByFoyer,
      foyersInfo,
    }),
    [contacts, investissementsByContact, investissementsByFoyer, foyersInfo]
  );

  const selectedTree = useMemo(() => {
    if (!selectedStats) return null;
    return buildPrescripteurTree(selectedStats.contact, treeContext);
  }, [selectedStats, treeContext]);

  const totalClientsApportes = prescripteursRacines.reduce(
    (sum, p) => sum + p.nombreClientsTotal,
    0
  );
  const totalPatrimoineApporte = prescripteursRacines.reduce(
    (sum, p) => sum + p.patrimoineApporteTotal,
    0
  );

  const toggleExpand = (id: number) => {
    setExpandedPrescripteurs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleInvestissements = (id: number) => {
    setExpandedInvestissements((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openPrescripteur = (stats: PrescripteurStats) => {
    setSelectedPrescripteurId(stats.contact.id);
    setSelectedContact(null);
    setExpandedPrescripteurs((prev) => new Set(prev).add(stats.contact.id));
  };

  const closeSplit = () => {
    setSelectedPrescripteurId(null);
    setSelectedContact(null);
    setShowContactDetail(false);
  };

  const openMember = (contact: Contact) => {
    if (onNavigate && contact.id) {
      requestOpenContact(contact.id, {
        setCurrentPage: onNavigate,
        currentPage: "prescripteurs",
      });
      return;
    }
    setSelectedContact(contact);
    if (!isWideLayout) {
      setShowContactDetail(true);
    }
  };

  const handleDeletePrescripteur = async (contact: Contact) => {
    const clientsRecommandes = contacts.filter((c) => c.prescripteur_id === contact.id);
    let confirmMessage = `Supprimer ${contact.prenom} ${contact.nom} ?`;
    if (clientsRecommandes.length > 0) {
      confirmMessage += `\n\nAttention : ${clientsRecommandes.length} client(s) recommandé(s) perdront leur lien prescripteur.`;
    }
    if (!confirm(confirmMessage)) return;

    try {
      await deleteContact(contact.id);
      if (selectedPrescripteurId === contact.id) {
        closeSplit();
      }
      await loadData();
    } catch (error) {
      console.error("Erreur suppression prescripteur:", error);
      alert("Erreur lors de la suppression");
    }
  };

  const handleDeleteContact = async (id: number) => {
    await loadData();
    if (selectedContact?.id === id) {
      setSelectedContact(null);
      setShowContactDetail(false);
    }
  };

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
          {Array.from({ length: 4 }).map((_, i) => (
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
            Prescripteurs
          </h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Arbre des recommandations (patrimoine « avec moi » uniquement) —{" "}
            <span className="tabular-nums text-foreground/80">
              {filteredPrescripteurs.length} racine
              {filteredPrescripteurs.length !== 1 ? "s" : ""}
            </span>
          </p>
        </div>
        <Button className="gap-2 shadow-sm" onClick={() => setShowPrescripteurForm(true)}>
          <Plus className="h-4 w-4" />
          Nouveau prescripteur
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Prescripteurs actifs"
          value={prescripteursRacines.length}
          description="Racines de l'arbre (sans prescripteur amont)"
          icon={Share2}
          accentColor="#6d28d9"
          iconColor="text-violet-700"
          iconBgColor="bg-violet-50"
        />
        <StatCard
          title="Clients recommandés"
          value={totalClientsApportes}
          description="Dans tous les arbres"
          icon={Users}
          accentColor="#1d4ed8"
          iconColor="text-blue-700"
          iconBgColor="bg-blue-50"
        />
        <StatCard
          title="Patrimoine apporté"
          value={formatEuroCentimes(totalPatrimoineApporte)}
          description="Hors patrimoine personnel des racines"
          icon={TrendingUp}
          accentColor="#047857"
          iconColor="text-emerald-700"
          iconBgColor="bg-emerald-50"
        />
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div>
              <CardTitle className="font-serif text-lg">Liste des prescripteurs</CardTitle>
              <CardDescription>
                {searchQuery
                  ? `${filteredPrescripteurs.length} résultat(s)`
                  : "Recherche par nom, foyer ou membre"}
              </CardDescription>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher…"
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
          </div>
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
                  Prescripteurs ({filteredPrescripteurs.length})
                </p>
              )}

              {filteredPrescripteurs.length === 0 ? (
                <div className="py-14 text-center rounded-xl border border-dashed border-border/80 bg-muted/15">
                  <Share2 className="h-12 w-12 mx-auto text-muted-foreground/35 mb-3" />
                  <p className="font-medium text-foreground/90">Aucun prescripteur</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
                    Créez un prescripteur ou assignez-en un depuis la fiche d&apos;un client.
                  </p>
                  <Button className="gap-2" onClick={() => setShowPrescripteurForm(true)}>
                    <Plus className="h-4 w-4" />
                    Nouveau prescripteur
                  </Button>
                </div>
              ) : showSplit ? (
                filteredPrescripteurs.map((p) => (
                  <PrescripteurSummaryCard
                    key={p.contact.id}
                    stats={p}
                    foyersInfo={foyersInfo}
                    compact
                    selected={
                      selectedPrescripteurId === p.contact.id && !selectedContact
                    }
                    onClick={() => openPrescripteur(p)}
                  />
                ))
              ) : (
                filteredPrescripteurs.map((prescripteur) => {
                  const tree = buildPrescripteurTree(prescripteur.contact, treeContext);
                  const isExpanded = expandedPrescripteurs.has(prescripteur.contact.id);

                  return (
                    <div
                      key={prescripteur.contact.id}
                      className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm"
                    >
                      <div className="flex items-stretch">
                        <div className="flex-1 min-w-0 p-1">
                          <PrescripteurSummaryCard
                            stats={prescripteur}
                            foyersInfo={foyersInfo}
                            onClick={() => openPrescripteur(prescripteur)}
                          />
                        </div>
                        <button
                          type="button"
                          className="px-4 border-l border-border/60 hover:bg-muted/50 flex items-center shrink-0"
                          onClick={() => toggleExpand(prescripteur.contact.id)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Replier l'arbre" : "Déplier l'arbre"}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-border/60 bg-muted/15 px-4 py-4">
                          <PrescripteurTreeView
                            root={tree}
                            foyersInfo={foyersInfo}
                            expandedNodes={expandedPrescripteurs}
                            expandedInvestissements={expandedInvestissements}
                            onToggleNode={toggleExpand}
                            onToggleInvestissements={toggleInvestissements}
                            onNodeClick={openMember}
                            onDeletePrescripteur={handleDeletePrescripteur}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {showSplit && selectedTree && selectedStats && (
              <div className="hidden lg:block min-w-0 lg:sticky lg:top-4 self-start w-full">
                {selectedContact ? (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 shadow-sm"
                      onClick={() => setSelectedContact(null)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      {getContactDisplayName(selectedStats.contact, foyersInfo)}
                    </Button>
                    <ContactDetail
                      key={selectedContact.id}
                      embedded
                      open
                      contact={selectedContact}
                      onOpenChange={(open) => {
                        if (!open) setSelectedContact(null);
                      }}
                      onDelete={handleDeleteContact}
                      onUpdate={() => void loadData()}
                      onContactRefreshed={setSelectedContact}
                      onNavigate={onNavigate}
                      onOpenContact={openMember}
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/70 bg-card shadow-md overflow-hidden flex flex-col max-h-[calc(100vh-10rem)]">
                    <div className="shrink-0 border-b border-border/60 bg-muted/30 px-4 py-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Arbre
                        </p>
                        <h3 className="text-lg font-serif font-bold text-primary truncate">
                          {getContactDisplayName(selectedStats.contact, foyersInfo)}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedStats.nombreClientsTotal} client
                          {selectedStats.nombreClientsTotal !== 1 ? "s" : ""} ·{" "}
                          {formatEuroCentimes(selectedStats.patrimoineApporteTotal)} apporté
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={closeSplit}
                        title="Fermer"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto min-h-0 p-4">
                      <PrescripteurTreeView
                        root={selectedTree}
                        foyersInfo={foyersInfo}
                        expandedNodes={expandedPrescripteurs}
                        expandedInvestissements={expandedInvestissements}
                        onToggleNode={toggleExpand}
                        onToggleInvestissements={toggleInvestissements}
                        onNodeClick={openMember}
                        onDeletePrescripteur={handleDeletePrescripteur}
                        selectedContactId={undefined}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ContactForm
        open={showPrescripteurForm}
        onOpenChange={setShowPrescripteurForm}
        createContext="prescripteurs"
        onSuccess={() => void loadData()}
      />

      {!isWideLayout && selectedContact && (
        <ContactDetail
          key={selectedContact.id}
          open={showContactDetail}
          onOpenChange={(open) => {
            setShowContactDetail(open);
            if (!open) setSelectedContact(null);
          }}
          contact={selectedContact}
          onDelete={handleDeleteContact}
          onUpdate={() => void loadData()}
          onContactRefreshed={setSelectedContact}
          onNavigate={onNavigate}
          onOpenContact={openMember}
        />
      )}
    </div>
  );
}
