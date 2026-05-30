import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users, ChevronDown, ChevronUp, Home, ArrowLeft, X, TreePine } from "lucide-react";
import { getAllContacts, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import {
  getInvestissementsByContact,
  getInvestissementsByFoyer,
  type Investissement,
} from "@/lib/api/tauri-investissements";
import { textMatchesSearch } from "@/lib/search-utils";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { buildFamilleGroups } from "@/lib/familles/build-famille-groups";
import type { FamilleGroup } from "@/lib/familles/famille-types";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { FamilleMemberTree } from "@/components/familles/FamilleMemberTree";
import { FamilleSummaryCard } from "@/components/familles/FamilleSummaryCard";
import { FamilleDetailHeader } from "@/components/familles/FamilleDetailHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import { useAppAutoRefresh } from "@/hooks/useAppAutoRefresh";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

type FamillesProps = {
  onNavigate?: (page: string) => void;
};

export function Familles({ onNavigate }: FamillesProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [investissementsByContact, setInvestissementsByContact] = useState<
    Record<number, Investissement[]>
  >({});
  const [investissementsByFoyer, setInvestissementsByFoyer] = useState<
    Record<number, Investissement[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFamilles, setExpandedFamilles] = useState<Set<string>>(new Set());
  const [selectedFamilleNom, setSelectedFamilleNom] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDetail, setShowContactDetail] = useState(false);

  const isWideLayout = useMediaQuery("(min-width: 1024px)");
  const showSplit =
    isWideLayout && (selectedFamilleNom != null || selectedContact != null);

  const loadData = useCallback(async () => {
    try {
      const [dataContacts, dataFoyers] = await Promise.all([
        getAllContacts(),
        getAllFoyers(),
      ]);
      setContacts(dataContacts);
      setFoyers(dataFoyers);

      const investsByContact: Record<number, Investissement[]> = {};
      const investsByFoyer: Record<number, Investissement[]> = {};

      await Promise.all(
        dataContacts.map(async (contact) => {
          try {
            investsByContact[contact.id] = await getInvestissementsByContact(contact.id);
          } catch {
            investsByContact[contact.id] = [];
          }
        })
      );

      await Promise.all(
        dataFoyers.map(async (foyer) => {
          try {
            investsByFoyer[foyer.id] = await getInvestissementsByFoyer(foyer.id);
          } catch {
            investsByFoyer[foyer.id] = [];
          }
        })
      );

      setInvestissementsByContact(investsByContact);
      setInvestissementsByFoyer(investsByFoyer);
      setSelectedContact((prev) => {
        if (!prev?.id) return prev;
        return dataContacts.find((c) => c.id === prev.id) ?? prev;
      });
    } catch (error) {
      console.error("Erreur chargement familles:", error);
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

  const familleGroups = useMemo(
    () =>
      buildFamilleGroups(
        contacts,
        foyers,
        investissementsByContact,
        investissementsByFoyer
      ),
    [contacts, foyers, investissementsByContact, investissementsByFoyer]
  );

  const filteredFamilles = useMemo(() => {
    if (!searchQuery) return familleGroups;
    return familleGroups.filter(
      (f) =>
        textMatchesSearch(searchQuery, f.nom) ||
        f.membres.some((m) =>
          textMatchesSearch(
            searchQuery,
            m.contact.prenom,
            m.contact.nom,
            `${m.contact.prenom} ${m.contact.nom}`
          )
        )
    );
  }, [familleGroups, searchQuery]);

  const selectedFamille = useMemo(
    () =>
      selectedFamilleNom
        ? (filteredFamilles.find((f) => f.nom === selectedFamilleNom) ??
          familleGroups.find((f) => f.nom === selectedFamilleNom) ??
          null)
        : null,
    [selectedFamilleNom, filteredFamilles, familleGroups]
  );

  const totalPatrimoineAvecMoi = useMemo(
    () => familleGroups.reduce((s, f) => s + f.patrimoineAvecMoi, 0),
    [familleGroups]
  );

  const memberCount = (f: FamilleGroup) =>
    f.membres.filter((m) => !m.isSpouse).length;

  const toggleExpand = (familleNom: string) => {
    const next = new Set(expandedFamilles);
    if (next.has(familleNom)) next.delete(familleNom);
    else next.add(familleNom);
    setExpandedFamilles(next);
  };

  const openFamille = (famille: FamilleGroup) => {
    setSelectedFamilleNom(famille.nom);
    setSelectedContact(null);
    if (!isWideLayout) {
      setExpandedFamilles((prev) => new Set(prev).add(famille.nom));
    }
  };

  const closeSplit = () => {
    setSelectedFamilleNom(null);
    setSelectedContact(null);
    setShowContactDetail(false);
  };

  const openMember = (contact: Contact) => {
    setSelectedContact(contact);
    if (!isWideLayout) {
      setShowContactDetail(true);
    }
  };

  const handleRoleFamilleChange = async (contact: Contact, newRole: string) => {
    try {
      await updateContact(
        contact.id,
        contactToUpdatePayload(contact, { role_famille: newRole })
      );
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contact.id ? { ...c, role_famille: newRole } : c
        )
      );
      setSelectedContact((prev) =>
        prev?.id === contact.id ? { ...prev, role_famille: newRole } : prev
      );
    } catch (error) {
      console.error("Erreur mise à jour rôle famille:", error);
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
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/50" />
          ))}
        </div>
        <div className="h-10 max-w-md rounded-md bg-muted/50" />
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
            Familles
          </h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Regroupement automatique par nom de famille (2 personnes ou plus).{" "}
            <span className="text-foreground/80 tabular-nums">
              {filteredFamilles.length} famille{filteredFamilles.length !== 1 ? "s" : ""}
            </span>{" "}
            affichée{filteredFamilles.length !== 1 ? "s" : ""}.
          </p>
        </div>
        {!showSplit && filteredFamilles.length > 0 && (
          <p className="text-sm text-muted-foreground hidden lg:block">
            <TreePine className="inline h-4 w-4 mr-1 text-primary/70" />
            Cliquez sur une famille pour voir le détail
          </p>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Familles"
          value={familleGroups.length}
          description="2 membres ou plus, même nom"
          icon={Users}
          accentColor="#1d4ed8"
          iconColor="text-blue-700"
          iconBgColor="bg-blue-50"
        />
        <StatCard
          title="Membres listés"
          value={familleGroups.reduce((sum, f) => sum + f.membres.length, 0)}
          description="Inclut conjoints d'autres noms"
          icon={Users}
          accentColor="#047857"
          iconColor="text-emerald-700"
          iconBgColor="bg-emerald-50"
        />
        <StatCard
          title="Patrimoine avec moi"
          value={formatEuroCentimes(totalPatrimoineAvecMoi)}
          description={`${foyers.length} foyer${foyers.length !== 1 ? "s" : ""} au total`}
          icon={Home}
          accentColor="#b45309"
          iconColor="text-amber-700"
          iconBgColor="bg-amber-50"
        />
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div>
              <CardTitle className="font-serif text-lg">Liste des familles</CardTitle>
              <CardDescription>
                {searchQuery
                  ? `${filteredFamilles.length} résultat(s) pour « ${searchQuery} »`
                  : "Recherchez par nom de famille ou par membre"}
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
                  aria-label="Effacer la recherche"
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
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 pb-1 sticky top-0 bg-card z-10 py-2">
                  Familles ({filteredFamilles.length})
                </p>
              )}

              {filteredFamilles.length === 0 ? (
                <div className="py-14 text-center text-muted-foreground rounded-xl border border-dashed border-border/80 bg-muted/15">
                  {searchQuery ? (
                    <p>Aucune famille ne correspond à votre recherche.</p>
                  ) : (
                    <div className="space-y-2">
                      <Users className="h-12 w-12 mx-auto opacity-35" />
                      <p className="font-medium text-foreground/80">Aucune famille détectée</p>
                      <p className="text-sm max-w-sm mx-auto">
                        Les familles apparaissent lorsque au moins deux contacts partagent le
                        même nom.
                      </p>
                    </div>
                  )}
                </div>
              ) : showSplit ? (
                filteredFamilles.map((famille) => (
                  <FamilleSummaryCard
                    key={famille.nom}
                    famille={famille}
                    memberCount={memberCount(famille)}
                    compact
                    selected={
                      selectedFamilleNom === famille.nom && !selectedContact
                    }
                    onClick={() => openFamille(famille)}
                  />
                ))
              ) : (
                filteredFamilles.map((famille) => {
                  const expanded = expandedFamilles.has(famille.nom);
                  return (
                    <div
                      key={famille.nom}
                      className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm"
                    >
                      <div className="flex items-stretch">
                        <div className="flex-1 min-w-0 p-1">
                          <FamilleSummaryCard
                            famille={famille}
                            memberCount={memberCount(famille)}
                            onClick={() => openFamille(famille)}
                          />
                        </div>
                        <button
                          type="button"
                          className="px-4 border-l border-border/60 hover:bg-muted/50 flex items-center shrink-0"
                          onClick={() => toggleExpand(famille.nom)}
                          aria-expanded={expanded}
                          aria-label={expanded ? "Replier" : "Déplier les membres"}
                        >
                          {expanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                      {expanded && (
                        <div className="border-t border-border/60 bg-muted/15 px-4 py-4">
                          <FamilleMemberTree
                            famille={famille}
                            foyers={foyers}
                            onRoleChange={handleRoleFamilleChange}
                            onMemberClick={openMember}
                            showTitle={false}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {showSplit && (
              <div className="hidden lg:block min-w-0 lg:sticky lg:top-4 self-start w-full">
                {selectedContact ? (
                  <div className="space-y-2">
                    {selectedFamilleNom && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 shadow-sm"
                        onClick={() => setSelectedContact(null)}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Famille {selectedFamilleNom}
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
                      onUpdate={() => void loadData()}
                      onContactRefreshed={setSelectedContact}
                      onNavigate={onNavigate}
                      onOpenContact={openMember}
                    />
                  </div>
                ) : selectedFamille ? (
                  <div className="rounded-xl border border-border/70 bg-card shadow-md overflow-hidden flex flex-col max-h-[calc(100vh-10rem)]">
                    <FamilleDetailHeader
                      famille={selectedFamille}
                      memberCount={memberCount(selectedFamille)}
                      onClose={closeSplit}
                    />
                    <div className="flex-1 overflow-y-auto min-h-0 p-4">
                      <FamilleMemberTree
                        famille={selectedFamille}
                        foyers={foyers}
                        onRoleChange={handleRoleFamilleChange}
                        onMemberClick={openMember}
                        selectedContactId={undefined}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
