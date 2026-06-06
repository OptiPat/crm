import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Users,
  Home,
  Filter,
  ArrowLeft,
  X,
  Building2,
} from "lucide-react";
import { getAllFoyers, deleteFoyer, type Foyer } from "@/lib/api/tauri-foyers";
import { cleanupOrphanedData, deleteContact, getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getContactsForFoyer } from "@/lib/foyers/foyer-utils";
import { getAllInvestissements } from "@/lib/api/tauri-investissements";
import { buildPatrimoineMaps } from "@/lib/investissements/bulk-patrimoine";
import { getFoyerTypeLabel } from "@/lib/foyers/foyer-display";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { FoyerForm } from "@/components/foyers/FoyerForm";
import { FoyerDetail } from "@/components/foyers/FoyerDetail";
import { FoyerSummaryCard } from "@/components/foyers/FoyerSummaryCard";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import { StatCard } from "@/components/dashboard/StatCard";
import { textMatchesSearch } from "@/lib/search-utils";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeFoyersChanged } from "@/lib/foyers/foyer-events";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import {
  SplitDetailLayout,
  SplitDetailPane,
  SplitDetailStack,
  SplitListColumn,
  ListSearchField,
  splitCardClassName,
  splitCardContentClassName,
  splitCardHeaderClassName,
} from "@/components/layout";

type FoyersProps = {
  onNavigate?: (page: string) => void;
};

export function Foyers({ onNavigate }: FoyersProps) {
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [patrimoineParFoyer, setPatrimoineParFoyer] = useState<Record<number, number>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [selectedFoyerId, setSelectedFoyerId] = useState<number | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDetail, setShowContactDetail] = useState(false);

  const isWideLayout = useMediaQuery("(min-width: 1024px)");
  const showSplit =
    isWideLayout && (selectedFoyerId != null || selectedContact != null);

  const loadFoyers = useCallback(async () => {
    try {
      await cleanupOrphanedData();
      const [foyersData, contactsData] = await Promise.all([
        getAllFoyers(),
        getAllContacts(),
      ]);
      setContacts(contactsData);

      const allInv = await getAllInvestissements();
      const maps = buildPatrimoineMaps(contactsData, foyersData, allInv);
      const patrimoines: Record<number, number> = {};
      for (const foyer of foyersData) {
        patrimoines[foyer.id] = Math.round(
          (maps.patrimoinesAvecMoi[`foyer_${foyer.id}`] ?? 0) * 100
        );
      }

      setFoyers(foyersData);
      setPatrimoineParFoyer(patrimoines);
      setSelectedContact((prev) => {
        if (!prev?.id) return prev;
        return contactsData.find((c) => c.id === prev.id) ?? prev;
      });
      setSelectedFoyerId((prev) => {
        if (prev == null) return prev;
        return foyersData.some((f) => f.id === prev) ? prev : null;
      });
    } catch (error) {
      console.error("Error loading foyers:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFoyers();
  }, [loadFoyers]);

  useEventAutoRefresh(loadFoyers, subscribeContactsChanged, subscribeFoyersChanged);

  const membresParFoyerId = useMemo(() => {
    const map = new Map<number, Contact[]>();
    for (const foyer of foyers) {
      map.set(foyer.id, getContactsForFoyer(contacts, foyer.id));
    }
    return map;
  }, [foyers, contacts]);

  const filteredFoyers = useMemo(() => {
    return foyers.filter((foyer) => {
      const membres = membresParFoyerId.get(foyer.id) ?? [];
      const membresText = membres.map((c) => `${c.prenom} ${c.nom}`).join(" ");
      const matchesSearch = textMatchesSearch(searchQuery, foyer.nom, membresText);
      const matchesType = typeFilter === "ALL" || foyer.type_foyer === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [foyers, membresParFoyerId, searchQuery, typeFilter]);

  const selectedFoyer = useMemo(
    () =>
      selectedFoyerId != null
        ? (foyers.find((f) => f.id === selectedFoyerId) ?? null)
        : null,
    [foyers, selectedFoyerId]
  );

  const totalPatrimoineAvecMoi = useMemo(
    () => Object.values(patrimoineParFoyer).reduce((s, v) => s + v, 0),
    [patrimoineParFoyer]
  );

  const contactsRattaches = useMemo(
    () => contacts.filter((c) => c.foyer_id != null).length,
    [contacts]
  );

  const openFoyer = (foyer: Foyer) => {
    setSelectedFoyerId(foyer.id);
    setSelectedContact(null);
  };

  const closeSplit = () => {
    setSelectedFoyerId(null);
    setSelectedContact(null);
    setShowContactDetail(false);
  };

  const openMember = (contact: Contact) => {
    setSelectedContact(contact);
    if (!isWideLayout) {
      setShowContactDetail(true);
    }
  };

  const handleDeleteFoyer = async (id: number) => {
    try {
      await deleteFoyer(id);
      if (selectedFoyerId === id) {
        closeSplit();
      }
      await loadFoyers();
    } catch (error) {
      console.error("Error deleting foyer:", error);
      alert("Erreur lors de la suppression: " + String(error));
    }
  };

  const handleDeleteContact = async (id: number) => {
    try {
      await deleteContact(id);
      await loadFoyers();
      if (selectedContact?.id === id) {
        setSelectedContact(null);
        setShowContactDetail(false);
      }
    } catch (error) {
      console.error("Erreur suppression contact:", error);
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
        <div className="h-10 max-w-md rounded-md bg-muted/50" />
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
            Foyers
          </h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Regrouper des personnes qui déclarent ensemble — noms de famille
            différents possibles.
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Foyers fiscaux et patrimoine commun —{" "}
            <span className="tabular-nums text-foreground/80">
              {filteredFoyers.length} sur {foyers.length}
            </span>
          </p>
        </div>
        <Button className="gap-2 shadow-sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nouveau foyer
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Foyers"
          value={foyers.length}
          description="Unités fiscales enregistrées"
          icon={Home}
          accentColor="#b45309"
          iconColor="text-amber-700"
          iconBgColor="bg-amber-50"
        />
        <StatCard
          title="Contacts rattachés"
          value={contactsRattaches}
          description="Liés à au moins un foyer"
          icon={Users}
          accentColor="#1d4ed8"
          iconColor="text-blue-700"
          iconBgColor="bg-blue-50"
        />
        <StatCard
          title="Patrimoine avec moi"
          value={formatEuroCentimes(totalPatrimoineAvecMoi)}
          description="Somme des foyers (commun + membres)"
          icon={Building2}
          accentColor="#047857"
          iconColor="text-emerald-700"
          iconBgColor="bg-emerald-50"
        />
      </div>

      <div className="sticky top-0 z-10 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 rounded-lg border border-border/60 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <ListSearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Nom du foyer ou membre…"
          className="flex-1 min-w-[220px]"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les types</SelectItem>
            <SelectItem value="COUPLE">Couples</SelectItem>
            <SelectItem value="FAMILLE">Avec enfant(s)</SelectItem>
            <SelectItem value="CELIBATAIRE">Célibataires</SelectItem>
            <SelectItem value="DIVORCE">Divorcé(e)s</SelectItem>
            <SelectItem value="VEUF">Veuf(ve)s</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className={splitCardClassName(showSplit, "border-border/70 shadow-sm")}>
        <CardHeader className={splitCardHeaderClassName(showSplit, "pb-3")}>
          <CardTitle className="font-serif text-lg">Liste des foyers</CardTitle>
          <CardDescription>
            {hasActiveFilters
              ? `${filteredFoyers.length} résultat(s) filtré(s)`
              : "Cliquez sur un foyer pour la fiche et les membres"}
          </CardDescription>
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 pt-2">
              {typeFilter !== "ALL" && (
                <Badge variant="secondary" className="gap-1 font-normal">
                  Type : {getFoyerTypeLabel(typeFilter)}
                  <button
                    type="button"
                    className="ml-1 hover:text-foreground"
                    onClick={() => setTypeFilter("ALL")}
                    aria-label="Retirer filtre type"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className={splitCardContentClassName(showSplit, "pt-0", true)}>
          <SplitDetailLayout
            showSplit={showSplit}
            nested
            list={
              <SplitListColumn
                showSplit={showSplit}
                nested
                listLabel={`Foyers (${filteredFoyers.length})`}
              >
              {filteredFoyers.length === 0 ? (
                <div className="py-14 text-center rounded-xl border border-dashed border-border/80 bg-muted/15">
                  <Home className="h-12 w-12 mx-auto text-muted-foreground/35 mb-3" />
                  <p className="font-medium text-foreground/90">
                    {hasActiveFilters ? "Aucun foyer trouvé" : "Aucun foyer"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
                    {hasActiveFilters
                      ? "Modifiez la recherche ou le filtre type."
                      : "Créez un foyer fiscal pour regrouper contacts et patrimoine commun."}
                  </p>
                  {!hasActiveFilters && (
                    <Button onClick={() => setShowForm(true)} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Créer un foyer
                    </Button>
                  )}
                </div>
              ) : (
                filteredFoyers.map((foyer) => {
                  const membres = membresParFoyerId.get(foyer.id) ?? [];
                  return (
                    <FoyerSummaryCard
                      key={foyer.id}
                      foyer={foyer}
                      membres={membres}
                      patrimoineAvecMoi={patrimoineParFoyer[foyer.id]}
                      compact={showSplit}
                      selected={
                        selectedFoyerId === foyer.id && !selectedContact
                      }
                      onClick={() => openFoyer(foyer)}
                    />
                  );
                })
              )}
              </SplitListColumn>
            }
            detail={
              showSplit ? (
                <SplitDetailPane nested>
                {selectedContact ? (
                  <SplitDetailStack
                    back={
                      selectedFoyer ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 shadow-sm"
                          onClick={() => setSelectedContact(null)}
                        >
                          <ArrowLeft className="h-4 w-4" />
                          {selectedFoyer.nom}
                        </Button>
                      ) : undefined
                    }
                  >
                    <ContactDetail
                      key={selectedContact.id}
                      embedded
                      open
                      contact={selectedContact}
                      onOpenChange={(open) => {
                        if (!open) setSelectedContact(null);
                      }}
                      onDelete={handleDeleteContact}
                      onUpdate={() => void loadFoyers()}
                      onContactRefreshed={setSelectedContact}
                      onNavigate={onNavigate}
                      onOpenContact={openMember}
                    />
                  </SplitDetailStack>
                ) : selectedFoyer ? (
                  <FoyerDetail
                    key={selectedFoyer.id}
                    embedded
                    open
                    foyer={selectedFoyer}
                    onOpenChange={(open) => {
                      if (!open) closeSplit();
                    }}
                    onDelete={handleDeleteFoyer}
                    onUpdate={() => void loadFoyers()}
                    onMemberClick={openMember}
                  />
                ) : null}
                </SplitDetailPane>
              ) : null
            }
          />
        </CardContent>
      </Card>

      <FoyerForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={() => void loadFoyers()}
      />

      {!isWideLayout && selectedFoyer && !selectedContact && (
        <FoyerDetail
          key={selectedFoyer.id}
          open={selectedFoyerId != null}
          onOpenChange={(open) => {
            if (!open) closeSplit();
          }}
          foyer={selectedFoyer}
          onDelete={handleDeleteFoyer}
          onUpdate={() => void loadFoyers()}
          onMemberClick={openMember}
        />
      )}

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
          onUpdate={() => void loadFoyers()}
          onContactRefreshed={setSelectedContact}
          onNavigate={onNavigate}
          onOpenContact={openMember}
        />
      )}
    </div>
  );
}
