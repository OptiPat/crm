import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ChevronDown, ChevronUp, Home, ArrowLeft, TreePine, Plus } from "lucide-react";
import { toast } from "sonner";
import { getAllContacts, deleteContact, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import {
  getAllInvestissements,
  type Investissement,
} from "@/lib/api/tauri-investissements";
import { textMatchesSearch } from "@/lib/search-utils";
import { indexInvestissementsByOwner } from "@/lib/investissements/bulk-patrimoine";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { getAllFamilles } from "@/lib/api/tauri-familles";
import { buildFamilleGroups } from "@/lib/familles/build-famille-groups";
import type { FamilleGroup } from "@/lib/familles/famille-types";
import {
  deleteFamilleIfEmpty,
  removeContactFromFamille,
} from "@/lib/familles/famille-members";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { FamilleMemberTree } from "@/components/familles/FamilleMemberTree";
import { FamilleSummaryCard } from "@/components/familles/FamilleSummaryCard";
import { FamilleDetailHeader } from "@/components/familles/FamilleDetailHeader";
import { FamilleCreateModal } from "@/components/familles/FamilleCreateModal";
import { FamilleAddMemberModal } from "@/components/familles/FamilleAddMemberModal";
import { StatCard } from "@/components/dashboard/StatCard";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeFoyersChanged } from "@/lib/foyers/foyer-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import {
  SplitDetailLayout,
  SplitDetailPane,
  SplitDetailStack,
  SplitListColumn,
  ListSearchField,
  embeddedDetailShellClassName,
  splitCardClassName,
  splitCardContentClassName,
  splitCardHeaderClassName,
} from "@/components/layout";

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
  const [famillesDb, setFamillesDb] = useState<Awaited<ReturnType<typeof getAllFamilles>>>([]);
  const [expandedFamilles, setExpandedFamilles] = useState<Set<string>>(new Set());
  const [selectedFamilleKey, setSelectedFamilleKey] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDetail, setShowContactDetail] = useState(false);
  const [showCreateFamilleModal, setShowCreateFamilleModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  const isWideLayout = useMediaQuery("(min-width: 1024px)");
  const showSplit =
    isWideLayout && (selectedFamilleKey != null || selectedContact != null);

  const loadData = useCallback(async () => {
    try {
      const [dataContacts, dataFoyers, dataFamilles] = await Promise.all([
        getAllContacts(),
        getAllFoyers(),
        getAllFamilles(),
      ]);
      setContacts(dataContacts);
      setFoyers(dataFoyers);
      setFamillesDb(dataFamilles);

      const allInv = await getAllInvestissements();
      const { byContactId, byFoyerId } = indexInvestissementsByOwner(allInv);
      const investsByContact: Record<number, Investissement[]> = {};
      const investsByFoyer: Record<number, Investissement[]> = {};
      for (const contact of dataContacts) {
        investsByContact[contact.id] = byContactId[contact.id] ?? [];
      }
      for (const foyer of dataFoyers) {
        investsByFoyer[foyer.id] = byFoyerId[foyer.id] ?? [];
      }

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

  useEventAutoRefresh(
    loadData,
    subscribeContactsChanged,
    subscribeFoyersChanged,
    subscribeInvestissementsChanged
  );

  const familleGroups = useMemo(
    () =>
      buildFamilleGroups(
        contacts,
        foyers,
        famillesDb,
        investissementsByContact,
        investissementsByFoyer
      ),
    [contacts, foyers, famillesDb, investissementsByContact, investissementsByFoyer]
  );

  const excludedHomonyms = useMemo(
    () => contacts.filter((c) => c.famille_regroupement_exclu),
    [contacts]
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
      selectedFamilleKey
        ? (filteredFamilles.find((f) => f.key === selectedFamilleKey) ??
          familleGroups.find((f) => f.key === selectedFamilleKey) ??
          null)
        : null,
    [selectedFamilleKey, filteredFamilles, familleGroups]
  );

  const totalPatrimoineAvecMoi = useMemo(
    () => familleGroups.reduce((s, f) => s + f.patrimoineAvecMoi, 0),
    [familleGroups]
  );

  const memberCount = (f: FamilleGroup) =>
    f.membres.filter((m) => !m.isSpouse).length;

  const toggleExpand = (familleKey: string) => {
    const next = new Set(expandedFamilles);
    if (next.has(familleKey)) next.delete(familleKey);
    else next.add(familleKey);
    setExpandedFamilles(next);
  };

  const openFamille = (famille: FamilleGroup) => {
    setSelectedFamilleKey(famille.key);
    setSelectedContact(null);
    if (!isWideLayout) {
      setExpandedFamilles((prev) => new Set(prev).add(famille.key));
    }
  };

  const closeSplit = () => {
    setSelectedFamilleKey(null);
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

  const handleRemoveFromManualFamille = async (
    contact: Contact,
    famille: FamilleGroup
  ) => {
    const msg = `Retirer ${contact.prenom} ${contact.nom} de la famille « ${famille.nom} » ?`;
    if (!confirm(msg)) return;
    try {
      await removeContactFromFamille(contact);
      const nextContacts = contacts.map((c) =>
        c.id === contact.id ? { ...c, famille_id: null } : c
      );
      await deleteFamilleIfEmpty(famille.familleId!, nextContacts);
      await loadData();
      setSelectedFamilleKey((prev) => (prev === famille.key ? null : prev));
      toast.success(`${contact.prenom} ${contact.nom} retiré de la famille`);
    } catch (error) {
      console.error("Erreur retrait membre famille:", error);
      toast.error("Impossible de retirer ce membre");
    }
  };

  const handleExcludeFromFamille = async (contact: Contact) => {
    const msg = `Retirer ${contact.prenom} ${contact.nom} du regroupement « ${contact.nom.toUpperCase()} » ?\n\nCe contact reste dans le CRM mais ne sera plus listé avec les autres homonymes.`;
    if (!confirm(msg)) return;
    try {
      await updateContact(
        contact.id,
        contactToUpdatePayload(contact, { famille_regroupement_exclu: true })
      );
      await loadData();
      if (selectedContact?.id === contact.id) {
        setSelectedContact((prev) =>
          prev ? { ...prev, famille_regroupement_exclu: true } : prev
        );
      }
      toast.success(`${contact.prenom} ${contact.nom} retiré du regroupement`);
    } catch (error) {
      console.error("Erreur exclusion famille:", error);
      toast.error("Impossible de retirer ce contact du regroupement");
    }
  };

  const handleReintegrateFamille = async (contact: Contact) => {
    try {
      await updateContact(
        contact.id,
        contactToUpdatePayload(contact, { famille_regroupement_exclu: false })
      );
      await loadData();
      toast.success(`${contact.prenom} ${contact.nom} réintégré au regroupement`);
    } catch (error) {
      console.error("Erreur réintégration famille:", error);
      toast.error("Impossible de réintégrer ce contact");
    }
  };

  const handleDeleteContact = async (id: number) => {
    try {
      await deleteContact(id);
      await loadData();
      if (selectedContact?.id === id) {
        setSelectedContact(null);
        setShowContactDetail(false);
      }
    } catch (error) {
      console.error("Erreur suppression contact:", error);
      alert("Erreur lors de la suppression: " + String(error));
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
            Familles créées manuellement ou regroupées automatiquement par nom (2+ homonymes).{" "}
            <span className="text-foreground/80 tabular-nums">
              {filteredFamilles.length} famille{filteredFamilles.length !== 1 ? "s" : ""}
            </span>{" "}
            affichée{filteredFamilles.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <Button
          type="button"
          className="gap-1.5 shrink-0"
          onClick={() => setShowCreateFamilleModal(true)}
        >
          <Plus className="h-4 w-4" />
          Créer une famille
        </Button>
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

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <ListSearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Nom de famille ou membre…"
          className="flex-1 min-w-[220px] max-w-xl"
        />
      </div>

      {excludedHomonyms.length > 0 && (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Hors regroupement ({excludedHomonyms.length}) — homonymes retirés manuellement
          </p>
          <ul className="flex flex-wrap gap-2">
            {excludedHomonyms.map((c) => (
              <li
                key={c.id}
                className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-1 text-xs"
              >
                <button
                  type="button"
                  className="hover:text-primary font-medium"
                  onClick={() => openMember(c)}
                >
                  {c.prenom} {c.nom}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void handleReintegrateFamille(c)}
                >
                  Réintégrer
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card className={splitCardClassName(showSplit, "border-border/70 shadow-sm")}>
        <CardHeader className={splitCardHeaderClassName(showSplit, "pb-3")}>
          <CardTitle className="font-serif text-lg">Liste des familles</CardTitle>
          <CardDescription>
            {searchQuery
              ? `${filteredFamilles.length} résultat(s) pour « ${searchQuery} »`
              : "Automatique par nom ou créée manuellement — choisissez qui regrouper"}
          </CardDescription>
        </CardHeader>

        <CardContent className={splitCardContentClassName(showSplit, "pt-0", true)}>
          <SplitDetailLayout
            showSplit={showSplit}
            nested
            list={
              <SplitListColumn
                showSplit={showSplit}
                nested
                listLabel={`Familles (${filteredFamilles.length})`}
              >
              {filteredFamilles.length === 0 ? (
                <div className="py-14 text-center text-muted-foreground rounded-xl border border-dashed border-border/80 bg-muted/15">
                  {searchQuery ? (
                    <p>Aucune famille ne correspond à votre recherche.</p>
                  ) : (
                    <div className="space-y-2">
                      <Users className="h-12 w-12 mx-auto opacity-35" />
                      <p className="font-medium text-foreground/80">Aucune famille détectée</p>
                      <p className="text-sm max-w-sm mx-auto">
                        Créez une famille manuellement ou attendez deux homonymes pour un
                        regroupement automatique.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setShowCreateFamilleModal(true)}
                      >
                        Créer une famille
                      </Button>
                    </div>
                  )}
                </div>
              ) : showSplit ? (
                filteredFamilles.map((famille) => (
                  <FamilleSummaryCard
                    key={famille.key}
                    famille={famille}
                    memberCount={memberCount(famille)}
                    compact
                    selected={
                      selectedFamilleKey === famille.key && !selectedContact
                    }
                    onClick={() => openFamille(famille)}
                  />
                ))
              ) : (
                filteredFamilles.map((famille) => {
                  const expanded = expandedFamilles.has(famille.key);
                  return (
                    <div
                      key={famille.key}
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
                          onClick={() => toggleExpand(famille.key)}
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
                            isManual={famille.isManual}
                            onRoleChange={handleRoleFamilleChange}
                            onMemberClick={openMember}
                            onExcludeFromFamille={(c) =>
                              famille.isManual
                                ? void handleRemoveFromManualFamille(c, famille)
                                : void handleExcludeFromFamille(c)
                            }
                            showTitle={false}
                          />
                        </div>
                      )}
                    </div>
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
                      selectedFamille ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 shadow-sm"
                          onClick={() => setSelectedContact(null)}
                        >
                          <ArrowLeft className="h-4 w-4" />
                          Famille {selectedFamille.nom}
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
                      onUpdate={() => void loadData()}
                      onContactRefreshed={setSelectedContact}
                      onNavigate={onNavigate}
                      onOpenContact={openMember}
                    />
                  </SplitDetailStack>
                ) : selectedFamille ? (
                  <div className={embeddedDetailShellClassName("shadow-md")}>
                    <FamilleDetailHeader
                      famille={selectedFamille}
                      memberCount={memberCount(selectedFamille)}
                      onClose={closeSplit}
                      onAddMember={
                        selectedFamille.isManual
                          ? () => setShowAddMemberModal(true)
                          : undefined
                      }
                    />
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      <FamilleMemberTree
                        famille={selectedFamille}
                        foyers={foyers}
                        isManual={selectedFamille.isManual}
                        onRoleChange={handleRoleFamilleChange}
                        onMemberClick={openMember}
                        onExcludeFromFamille={(c) =>
                          selectedFamille.isManual
                            ? void handleRemoveFromManualFamille(c, selectedFamille)
                            : void handleExcludeFromFamille(c)
                        }
                      />
                    </div>
                  </div>
                ) : null}
                </SplitDetailPane>
              ) : null
            }
          />
        </CardContent>
      </Card>

      <FamilleCreateModal
        open={showCreateFamilleModal}
        onOpenChange={setShowCreateFamilleModal}
        onSuccess={() => void loadData()}
      />
      {selectedFamille?.isManual && selectedFamille.familleId != null && (
        <FamilleAddMemberModal
          open={showAddMemberModal}
          onOpenChange={setShowAddMemberModal}
          famille={selectedFamille}
          existingMemberIds={selectedFamille.membres
            .filter((m) => !m.isSpouse)
            .map((m) => m.contact.id!)}
          onSuccess={() => void loadData()}
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
          onUpdate={() => void loadData()}
          onContactRefreshed={setSelectedContact}
          onNavigate={onNavigate}
          onOpenContact={openMember}
        />
      )}
    </div>
  );
}
