import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  ChevronDown,
  ChevronUp,
  Share2,
  TrendingUp,
  Plus,
  X,
  ArrowLeft,
  Pencil,
  UserPlus,
  Link2,
} from "lucide-react";
import { getAllContacts, deleteContact, type Contact } from "@/lib/api/tauri-contacts";
import { ContactForm } from "@/components/contacts/ContactForm";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import { getAllInvestissements, type Investissement } from "@/lib/api/tauri-investissements";
import { indexInvestissementsByOwner } from "@/lib/investissements/bulk-patrimoine";
import {
  buildFoyersInfo,
  buildPrescripteurTree,
  computePrescripteursRacines,
  countDirectClientsForPrescripteur,
  getContactDisplayName,
  matchesContactOrFoyer,
  type PrescripteurStats,
} from "@/lib/prescripteurs/prescripteur-tree";
import { PrescripteurSummaryCard } from "@/components/prescripteurs/PrescripteurSummaryCard";
import { PrescripteurTreeView } from "@/components/prescripteurs/PrescripteurTreeView";
import { PrescripteurLinkModal } from "@/components/prescripteurs/PrescripteurLinkModal";
import { StatCard } from "@/components/dashboard/StatCard";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
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
  const [showEditPrescripteurForm, setShowEditPrescripteurForm] = useState(false);
  const [showClientRecommandeForm, setShowClientRecommandeForm] = useState(false);
  const [showLinkClientModal, setShowLinkClientModal] = useState(false);
  const [actionPrescripteur, setActionPrescripteur] = useState<Contact | null>(null);
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

  useEventAutoRefresh(loadData, subscribeContactsChanged);

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
    setSelectedContact(contact);
    if (!isWideLayout) {
      setShowContactDetail(true);
    }
  };

  const prescripteurForModals = actionPrescripteur ?? selectedStats?.contact ?? null;

  const openAddClientFor = (contact: Contact) => {
    setActionPrescripteur(contact);
    setShowClientRecommandeForm(true);
  };

  const openLinkClientFor = (contact: Contact) => {
    setActionPrescripteur(contact);
    setShowLinkClientModal(true);
  };

  const renderPrescripteurActions = (contact: Contact) => (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          setActionPrescripteur(contact);
          setSelectedPrescripteurId(contact.id);
          setShowEditPrescripteurForm(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
        Modifier
      </Button>
      <Button
        type="button"
        size="sm"
        className="gap-1.5"
        onClick={() => openAddClientFor(contact)}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Nouveau client recommandé
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => openLinkClientFor(contact)}
      >
        <Link2 className="h-3.5 w-3.5" />
        Lier un contact existant
      </Button>
    </div>
  );

  const handleDeletePrescripteur = async (contact: Contact) => {
    const clientsOrphelins = contacts.filter((c) => c.prescripteur_id === contact.id);
    const clientsFoyer = countDirectClientsForPrescripteur(contact, contacts, foyersInfo);
    let confirmMessage = `Supprimer ${contact.prenom} ${contact.nom} ?`;
    if (clientsOrphelins.length > 0) {
      confirmMessage += `\n\nAttention : ${clientsOrphelins.length} client(s) recommandé(s) perdront leur lien prescripteur.`;
    } else if (clientsFoyer > 0) {
      confirmMessage += `\n\nCe foyer compte ${clientsFoyer} client(s) recommandé(s) liés à un autre membre — non affectés par cette suppression.`;
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

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <ListSearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Nom, foyer ou membre…"
          className="flex-1 min-w-[220px] max-w-xl"
        />
      </div>

      <Card className={splitCardClassName(showSplit, "border-border/70 shadow-sm")}>
        <CardHeader className={splitCardHeaderClassName(showSplit, "pb-3")}>
          <CardTitle className="font-serif text-lg">Liste des prescripteurs</CardTitle>
          <CardDescription>
            {searchQuery
              ? `${filteredPrescripteurs.length} résultat(s)`
              : "Arbre des recommandations — cliquez pour ouvrir l'arbre"}
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
                listLabel={`Prescripteurs (${filteredPrescripteurs.length})`}
              >
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
                        <div className="border-t border-border/60 bg-muted/15 px-4 py-4 space-y-3">
                          {!showSplit && renderPrescripteurActions(prescripteur.contact)}
                          <PrescripteurTreeView
                            root={tree}
                            foyersInfo={foyersInfo}
                            expandedNodes={expandedPrescripteurs}
                            expandedInvestissements={expandedInvestissements}
                            onToggleNode={toggleExpand}
                            onToggleInvestissements={toggleInvestissements}
                            onNodeClick={openMember}
                            onDeletePrescripteur={handleDeletePrescripteur}
                            onAddClientRecommande={openAddClientFor}
                            onLinkClient={openLinkClientFor}
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
              showSplit && selectedTree && selectedStats ? (
                <SplitDetailPane nested>
                {selectedContact ? (
                  <SplitDetailStack
                    back={
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
                ) : (
                  <div className={embeddedDetailShellClassName("shadow-md")}>
                    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 bg-muted/30 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Arbre
                        </p>
                        <h3 className="truncate font-serif text-lg font-bold text-primary">
                          {getContactDisplayName(selectedStats.contact, foyersInfo)}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedStats.nombreClientsTotal} client
                          {selectedStats.nombreClientsTotal !== 1 ? "s" : ""} ·{" "}
                          {formatEuroCentimes(selectedStats.patrimoineApporteTotal)} apporté
                        </p>
                      </div>
                      {renderPrescripteurActions(selectedStats.contact)}
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
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      <PrescripteurTreeView
                        root={selectedTree}
                        foyersInfo={foyersInfo}
                        expandedNodes={expandedPrescripteurs}
                        expandedInvestissements={expandedInvestissements}
                        onToggleNode={toggleExpand}
                        onToggleInvestissements={toggleInvestissements}
                        onNodeClick={openMember}
                        onDeletePrescripteur={handleDeletePrescripteur}
                        onAddClientRecommande={openAddClientFor}
                        onLinkClient={openLinkClientFor}
                        selectedContactId={undefined}
                      />
                    </div>
                  </div>
                )}
                </SplitDetailPane>
              ) : null
            }
          />
        </CardContent>
      </Card>

      <ContactForm
        open={showPrescripteurForm}
        onOpenChange={setShowPrescripteurForm}
        createContext="prescripteurs"
        onSuccess={() => void loadData()}
        onCreated={(created) => {
          void loadData();
          setActionPrescripteur(created);
          openPrescripteur({
            contact: created,
            nombreClientsTotal: 0,
            nombreClientsDirects: 0,
            patrimoineApporteTotal: 0,
            patrimoinePersonnel: 0,
          });
        }}
      />

      {prescripteurForModals && (
        <>
          <ContactForm
            open={showEditPrescripteurForm}
            onOpenChange={setShowEditPrescripteurForm}
            contact={prescripteurForModals}
            createContext="detail"
            onSuccess={() => void loadData()}
          />
          <ContactForm
            open={showClientRecommandeForm}
            onOpenChange={setShowClientRecommandeForm}
            createContext="clients"
            defaultPrescripteurId={prescripteurForModals.id}
            onSuccess={() => void loadData()}
            onCreated={(created) => {
              void loadData();
              openMember(created);
            }}
          />
          <PrescripteurLinkModal
            open={showLinkClientModal}
            onOpenChange={setShowLinkClientModal}
            prescripteur={prescripteurForModals}
            onSuccess={() => void loadData()}
          />
        </>
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
