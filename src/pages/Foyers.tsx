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
import {
  Plus,
  Search,
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

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
            <div>
              <CardTitle className="font-serif text-lg">Liste des foyers</CardTitle>
              <CardDescription>
                {hasActiveFilters
                  ? `${filteredFoyers.length} résultat(s) filtré(s)`
                  : "Recherche par nom ou membre, filtre par type"}
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="relative flex-1 sm:min-w-[220px]">
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
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-4 w-4 mr-2 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous les types</SelectItem>
                  <SelectItem value="COUPLE">Couples</SelectItem>
                  <SelectItem value="FAMILLE">Familles</SelectItem>
                  <SelectItem value="CELIBATAIRE">Célibataires</SelectItem>
                  <SelectItem value="DIVORCE">Divorcé(e)s</SelectItem>
                  <SelectItem value="VEUF">Veuf(ve)s</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
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
                  Foyers ({filteredFoyers.length})
                </p>
              )}

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
            </div>

            {showSplit && (
              <div className="hidden lg:block min-w-0 lg:sticky lg:top-4 self-start w-full">
                {selectedContact ? (
                  <div className="space-y-2">
                    {selectedFoyer && (
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
                    )}
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
                  </div>
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
              </div>
            )}
          </div>
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
