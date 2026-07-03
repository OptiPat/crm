import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatCard } from "@/components/dashboard/StatCard";
import { DocumentListRow } from "@/components/documents/DocumentListRow";
import { DocumentPreviewSheet } from "@/components/documents/DocumentPreviewSheet";
import { VirtualizedDocumentsPortfolio } from "@/components/documents/VirtualizedDocumentsPortfolio";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { RioImportWizard } from "@/components/documents/RioImportWizard";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import {
  Upload,
  Search,
  Filter,
  X,
  FileText,
  IdCard,
  UserX,
  FolderOpen,
} from "lucide-react";
import {
  getAllDocuments,
  deleteDocument,
  stageDocumentFromPath,
  type Document,
} from "@/lib/api/tauri-documents";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { openDocumentFile } from "@/lib/api/tauri-system";
import {
  canReimportStelliumDocument,
  isDocumentPreviewable,
} from "@/lib/documents/document-display";
import {
  DOCUMENTS_PORTFOLIO_GROUP_LABELS,
  DOCUMENTS_PORTFOLIO_SORT_LABELS,
  groupDocumentsPortfolio,
  resolveDocumentsGroupModeWhenFiltered,
  sortDocumentsPortfolio,
  type DocumentsPortfolioGroup,
  type DocumentsPortfolioSort,
} from "@/lib/documents/documents-portfolio-utils";
import { toast } from "sonner";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeDocumentsChanged } from "@/lib/documents/document-events";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import {
  consumeDocumentsContactFocus,
  setDocumentsContactFocus,
} from "@/lib/documents/documents-navigation";
import {
  buildDocumentsActiveFilterChips,
  type DocumentsActiveFilterId,
} from "@/lib/documents/documents-active-filters";
import {
  computeDocumentsPageStats,
  matchesDocumentsStatFilter,
  type DocumentsStatFilter,
} from "@/lib/documents/documents-page-stats";
import { textMatchesSearch } from "@/lib/search-utils";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import { useDocumentsPageDragDrop } from "@/hooks/useDocumentsPageDragDrop";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import {
  detectDroppedDocumentImport,
  isStelliumDropKind,
  type StagedDocumentFile,
} from "@/lib/documents/detect-dropped-document-import";
import {
  loadDocumentsPagePreferences,
  saveDocumentsPagePreferences,
} from "@/lib/documents/documents-page-preferences";
import type { ExtractedData } from "@/lib/pdf";
import { cn } from "@/lib/utils";

type DocumentsProps = {
  onNavigate?: (page: string) => void;
};

export function Documents({ onNavigate }: DocumentsProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [contactsById, setContactsById] = useState<Record<number, Contact>>({});
  const [loading, setLoading] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statFilter, setStatFilter] = useState<DocumentsStatFilter | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadDefaultType, setUploadDefaultType] = useState<string | undefined>();
  const [uploadInitialFile, setUploadInitialFile] = useState<StagedDocumentFile | undefined>();
  const [stelliumDropImport, setStelliumDropImport] = useState<{
    file: StagedDocumentFile;
    defaultTypeDocument: string;
    extractedData?: ExtractedData;
  } | null>(null);
  const [dropBusy, setDropBusy] = useState(false);
  const [contactFilterId, setContactFilterId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [sortKey, setSortKey] = useState<DocumentsPortfolioSort>("date_desc");
  const [groupMode, setGroupMode] = useState<DocumentsPortfolioGroup>("flat");
  const [rioReimportDoc, setRioReimportDoc] = useState<Document | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const focusConsumedRef = useRef(false);

  const loadDocuments = useCallback(async () => {
    try {
      const [data, contacts] = await Promise.all([
        getAllDocuments(),
        getAllContacts(),
      ]);
      setDocuments(data);
      const map: Record<number, Contact> = {};
      for (const c of contacts) {
        if (c.id) map[c.id] = c;
      }
      setContactsById(map);
    } catch (error) {
      console.error("Error loading documents:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const prefs = loadDocumentsPagePreferences();
    setSortKey(prefs.sortKey);
    setGroupMode(prefs.groupMode);
    setTypeFilter(prefs.typeFilter);
    setContactFilterId(prefs.contactFilterId);
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    saveDocumentsPagePreferences({
      sortKey,
      groupMode,
      typeFilter,
      contactFilterId,
    });
  }, [prefsLoaded, sortKey, groupMode, typeFilter, contactFilterId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    if (focusConsumedRef.current) return;
    focusConsumedRef.current = true;
    const focusId = consumeDocumentsContactFocus();
    if (focusId != null) {
      setContactFilterId(focusId);
    }
  }, []);

  useAppNavigationListener((detail) => {
    if (detail.type !== "documents") return;
    if (detail.contactId != null) {
      setDocumentsContactFocus(detail.contactId);
      setContactFilterId(detail.contactId);
    }
  }, []);

  useEventAutoRefresh(loadDocuments, subscribeDocumentsChanged, subscribeContactsChanged);

  const { openContactSheet, sheet: contactDetailSheet } = useContactDetailSheet({
    onNavigate,
    onUpdate: () => void loadDocuments(),
  });

  const pageStats = useMemo(
    () => computeDocumentsPageStats(documents),
    [documents]
  );

  const contacts = useMemo(() => Object.values(contactsById), [contactsById]);

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (contactFilterId != null && doc.contact_id !== contactFilterId) {
        return false;
      }
      if (!matchesDocumentsStatFilter(doc, statFilter)) {
        return false;
      }
      const client = doc.contact_id ? contactsById[doc.contact_id] : undefined;
      const clientLabel = client ? `${client.prenom} ${client.nom}` : "";
      const matchesSearch = textMatchesSearch(
        searchQuery,
        doc.nom_fichier,
        clientLabel
      );
      const matchesType = typeFilter === "ALL" || doc.type_document === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [documents, searchQuery, typeFilter, contactsById, contactFilterId, statFilter]);

  const hasNarrowingFilters =
    statFilter != null ||
    typeFilter !== "ALL" ||
    contactFilterId != null ||
    searchQuery.trim() !== "";

  const effectiveGroupMode = useMemo(
    () => resolveDocumentsGroupModeWhenFiltered(groupMode, hasNarrowingFilters),
    [groupMode, hasNarrowingFilters]
  );

  const sortedDocuments = useMemo(
    () => sortDocumentsPortfolio(filteredDocuments, sortKey, contactsById),
    [filteredDocuments, sortKey, contactsById]
  );

  const portfolioGroups = useMemo(
    () => groupDocumentsPortfolio(sortedDocuments, effectiveGroupMode, contactsById),
    [sortedDocuments, effectiveGroupMode, contactsById]
  );

  const documentContactIds = useMemo(() => {
    const ids = new Set<number>();
    for (const doc of filteredDocuments) {
      if (doc.contact_id != null) ids.add(doc.contact_id);
    }
    return [...ids];
  }, [filteredDocuments]);

  const contactFilterLabel = useMemo(() => {
    if (contactFilterId == null) return null;
    const client = contactsById[contactFilterId];
    if (client) return `${client.prenom} ${client.nom}`;
    return `Contact #${contactFilterId}`;
  }, [contactFilterId, contactsById]);

  const activeFilterChips = useMemo(
    () =>
      buildDocumentsActiveFilterChips({
        statFilter,
        typeFilter,
        contactLabel: contactFilterLabel,
        searchQuery,
        sortKey,
        groupMode: effectiveGroupMode,
      }),
    [statFilter, typeFilter, contactFilterLabel, searchQuery, sortKey, effectiveGroupMode]
  );

  const hasActiveFilters =
    hasNarrowingFilters || sortKey !== "date_desc" || groupMode !== "flat";

  const resetFilters = () => {
    setSearchQuery("");
    setTypeFilter("ALL");
    setStatFilter(null);
    setContactFilterId(null);
    setSortKey("date_desc");
    setGroupMode("flat");
  };

  const toggleStatFilter = (filter: DocumentsStatFilter) => {
    setStatFilter((active) => (active === filter ? null : filter));
  };

  const removeActiveFilter = (id: DocumentsActiveFilterId) => {
    switch (id) {
      case "stat_patrimoine":
      case "stat_identite":
      case "stat_sans_client":
        setStatFilter(null);
        break;
      case "type":
        setTypeFilter("ALL");
        break;
      case "contact":
        setContactFilterId(null);
        break;
      case "search":
        setSearchQuery("");
        break;
      case "sort":
        setSortKey("date_desc");
        break;
      case "group":
        setGroupMode("flat");
        break;
      default:
        break;
    }
  };

  const openUpload = (defaultTypeDocument?: string) => {
    setUploadInitialFile(undefined);
    setUploadDefaultType(defaultTypeDocument);
    setShowUpload(true);
  };

  const handleDroppedPaths = useCallback(
    async (paths: string[]) => {
      const sourcePath = paths[0];
      if (!sourcePath || dropBusy) return;
      setDropBusy(true);
      try {
        const staged = await stageDocumentFromPath(sourcePath);
        const plan = await detectDroppedDocumentImport(staged);
        if (isStelliumDropKind(plan.kind)) {
          setStelliumDropImport({
            file: staged,
            defaultTypeDocument: plan.defaultTypeDocument,
            extractedData: plan.extractedData,
          });
          toast.info(
            plan.kind === "stellium_qpi"
              ? "QPI détecté — vérifiez l'import."
              : "RIO détecté — vérifiez l'import."
          );
          return;
        }
        setUploadDefaultType(plan.defaultTypeDocument);
        setUploadInitialFile(staged);
        setShowUpload(true);
        if (plan.kind === "identity") {
          toast.info("Pièce d'identité probable — choisissez le client.");
        }
      } catch (error) {
        console.error("Drop import:", error);
        toast.error("Impossible d'importer le fichier déposé.");
      } finally {
        setDropBusy(false);
      }
    },
    [dropBusy]
  );

  const { isDragging } = useDocumentsPageDragDrop(handleDroppedPaths);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteDocument(deleteTarget.id);
      setDeleteTarget(null);
      await loadDocuments();
      toast.success("Document supprimé");
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleOpenFile = async (doc: Document) => {
    try {
      await openDocumentFile(doc.chemin_fichier);
    } catch (error) {
      console.error(error);
      toast.error("Impossible d'ouvrir le fichier");
    }
  };

  const openClient = (contactId: number) => {
    void openContactSheet(contactId, documentContactIds);
  };

  const handlePreviewDocument = (doc: Document) => {
    if (isDocumentPreviewable(doc)) {
      setPreviewDoc(doc);
      return;
    }
    void handleOpenFile(doc);
  };

  const handleReimportStellium = (doc: Document) => {
    if (!canReimportStelliumDocument(doc)) {
      toast.error("Relance impossible — PDF Stellium avec client lié requis.");
      return;
    }
    setRioReimportDoc(doc);
  };

  const renderDocumentRow = (doc: Document) => {
    const client = doc.contact_id != null ? contactsById[doc.contact_id] : undefined;
    return (
      <DocumentListRow
        key={doc.id}
        doc={doc}
        client={client}
        onPreview={handlePreviewDocument}
        onOpenFile={(item) => void handleOpenFile(item)}
        onDelete={setDeleteTarget}
        onOpenClient={openClient}
        onReimportStellium={handleReimportStellium}
      />
    );
  };

  return (
    <div className="space-y-6 relative">
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]">
          <div className="rounded-xl border-2 border-dashed border-primary bg-background/95 px-8 py-6 text-center shadow-lg">
            <Upload className="h-10 w-10 mx-auto text-primary mb-2" />
            <p className="text-sm font-medium">Déposez le fichier pour l&apos;importer</p>
            <p className="text-xs text-muted-foreground mt-1">
              Détection auto RIO, QPI ou pièce d&apos;identité
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Documents
          </h2>
          <p className="text-muted-foreground">
            Gérez les documents de vos clients
          </p>
        </div>
        <Button className="gap-2" onClick={() => openUpload()}>
          <Upload className="h-4 w-4" />
          Importer un document
        </Button>
      </div>

      <section className="space-y-2" aria-label="Synthèse documents">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Synthèse — cliquer pour filtrer la liste
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total documents"
            value={pageStats.total}
            description={
              statFilter == null && !hasActiveFilters
                ? "Bibliothèque complète"
                : `${filteredDocuments.length} affiché${filteredDocuments.length > 1 ? "s" : ""} — cliquer pour tout voir`
            }
            icon={FolderOpen}
            accentColor="#dc216e"
            iconColor="text-rose-700"
            iconBgColor="bg-rose-50"
            highlight={statFilter == null && hasActiveFilters}
            onClick={hasActiveFilters ? resetFilters : undefined}
          />
          <StatCard
            title="RIO / patrimoine"
            value={pageStats.patrimoine}
            description="Relevés Stellium, QPI — cliquer pour filtrer"
            icon={FileText}
            accentColor="#7C3AED"
            iconColor="text-violet-600"
            iconBgColor="bg-violet-50"
            highlight={statFilter === "patrimoine"}
            onClick={
              pageStats.patrimoine > 0 || statFilter === "patrimoine"
                ? () => toggleStatFilter("patrimoine")
                : undefined
            }
          />
          <StatCard
            title="Identité"
            value={pageStats.identite}
            description="CNI, passeport — cliquer pour filtrer"
            icon={IdCard}
            accentColor="#3B82F6"
            iconColor="text-blue-600"
            iconBgColor="bg-blue-50"
            highlight={statFilter === "identite"}
            onClick={
              pageStats.identite > 0 || statFilter === "identite"
                ? () => toggleStatFilter("identite")
                : undefined
            }
          />
          <StatCard
            title="Sans client lié"
            value={pageStats.sansClient}
            description="Documents orphelins — cliquer pour filtrer"
            icon={UserX}
            accentColor="#C9A227"
            iconColor="text-amber-600"
            iconBgColor="bg-amber-50"
            highlight={statFilter === "sans_client"}
            onClick={
              pageStats.sansClient > 0 || statFilter === "sans_client"
                ? () => toggleStatFilter("sans_client")
                : undefined
            }
          />
        </div>
      </section>

      <Card className={cn(isDragging && "ring-2 ring-primary/40")}>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Bibliothèque de documents</CardTitle>
                <CardDescription>
                  {filteredDocuments.length} document
                  {filteredDocuments.length > 1 ? "s" : ""} sur {documents.length}
                  {documents.length > 0 && (
                    <span className="text-muted-foreground/80">
                      {" "}
                      — glissez un fichier depuis l&apos;explorateur sur cette page
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>

            <div className="flex gap-4 flex-wrap items-end">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un document ou un client..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="w-full sm:w-[240px]">
                <ContactPersonSearch
                  placeholder="Filtrer par client..."
                  contacts={contacts}
                  value={contactFilterId ?? undefined}
                  onChange={(id) => setContactFilterId(id ?? null)}
                  onOpenContact={
                    (c) => {
                      if (c.id) openClient(c.id);
                    }
                  }
                />
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous les types</SelectItem>
                  <SelectItem value="IDENTITE">{getDocumentTypeLabel("IDENTITE")}</SelectItem>
                  <SelectItem value="FISCAL">{getDocumentTypeLabel("FISCAL")}</SelectItem>
                  <SelectItem value="PATRIMOINE">{getDocumentTypeLabel("PATRIMOINE")}</SelectItem>
                  <SelectItem value="QPI">{getDocumentTypeLabel("QPI")}</SelectItem>
                  <SelectItem value="CONTRAT">{getDocumentTypeLabel("CONTRAT")}</SelectItem>
                  <SelectItem value="RELEVE">{getDocumentTypeLabel("RELEVE")}</SelectItem>
                  <SelectItem value="AUTRE">{getDocumentTypeLabel("AUTRE")}</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sortKey}
                onValueChange={(v) => setSortKey(v as DocumentsPortfolioSort)}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Tri" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOCUMENTS_PORTFOLIO_SORT_LABELS) as DocumentsPortfolioSort[]).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {DOCUMENTS_PORTFOLIO_SORT_LABELS[key]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>

              <Select
                value={groupMode}
                onValueChange={(v) => setGroupMode(v as DocumentsPortfolioGroup)}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Regroupement" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOCUMENTS_PORTFOLIO_GROUP_LABELS) as DocumentsPortfolioGroup[]).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {DOCUMENTS_PORTFOLIO_GROUP_LABELS[key]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {hasNarrowingFilters && groupMode !== "flat" && (
              <p className="text-xs text-muted-foreground">
                Filtre actif — affichage en liste unique (choisissez « Liste unique » pour retrouver
                le regroupement une fois les filtres levés).
              </p>
            )}

            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                <span className="text-muted-foreground shrink-0">Filtres actifs :</span>
                {activeFilterChips.map((chip) => (
                  <button
                    key={`${chip.id}-${chip.label}`}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5 text-xs font-medium hover:bg-muted/60 transition-colors"
                    onClick={() => removeActiveFilter(chip.id)}
                    aria-label={`Retirer le filtre ${chip.label}`}
                  >
                    {chip.label}
                    <X className="h-3 w-3 opacity-60" />
                  </button>
                ))}
                {contactFilterId != null && onNavigate && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0 text-xs"
                    onClick={() => openClient(contactFilterId)}
                  >
                    Voir la fiche
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs ml-auto gap-1"
                  onClick={resetFilters}
                >
                  <X className="h-3.5 w-3.5" />
                  Tout effacer
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/25 px-6 py-10 text-center">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">Aucun document</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
                Importez un RIO ou relevé patrimonial pour alimenter les fiches, une pièce
                d&apos;identité pour préremplir l&apos;état civil, ou tout autre document client.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="gap-1"
                  onClick={() => openUpload("PATRIMOINE")}
                >
                  <FileText className="h-4 w-4" />
                  Importer un RIO / relevé patrimonial
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => openUpload("IDENTITE")}
                >
                  <IdCard className="h-4 w-4" />
                  Pièce d&apos;identité
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => openUpload("AUTRE")}
                >
                  <Upload className="h-4 w-4" />
                  Autre document
                </Button>
              </div>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                Aucun document pour ces filtres.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                Tout afficher
              </Button>
            </div>
          ) : (
            <VirtualizedDocumentsPortfolio
              groups={portfolioGroups}
              itemCount={sortedDocuments.length}
              renderRow={renderDocumentRow}
            />
          )}
        </CardContent>
      </Card>

      <DocumentUpload
        open={showUpload}
        onOpenChange={(open) => {
          setShowUpload(open);
          if (!open) {
            setUploadDefaultType(undefined);
            setUploadInitialFile(undefined);
          }
        }}
        onSuccess={loadDocuments}
        defaultContactId={contactFilterId ?? undefined}
        defaultTypeDocument={uploadDefaultType}
        initialUploadedFile={uploadInitialFile}
      />

      <DocumentPreviewSheet
        doc={previewDoc}
        open={previewDoc != null}
        onOpenChange={(open) => {
          if (!open) setPreviewDoc(null);
        }}
        clientLabel={
          previewDoc?.contact_id != null
            ? (() => {
                const c = contactsById[previewDoc.contact_id!];
                return c ? `${c.prenom} ${c.nom}` : undefined;
              })()
            : undefined
        }
        onOpenExternal={
          previewDoc ? () => void handleOpenFile(previewDoc) : undefined
        }
        onOpenClient={
          previewDoc?.contact_id != null
            ? () => openClient(previewDoc.contact_id!)
            : undefined
        }
      />

      <RioImportWizard
        open={stelliumDropImport != null || rioReimportDoc != null}
        onOpenChange={(open) => {
          if (!open) {
            setStelliumDropImport(null);
            setRioReimportDoc(null);
          }
        }}
        onSuccess={() => {
          setStelliumDropImport(null);
          setRioReimportDoc(null);
          void loadDocuments();
        }}
        contactId={rioReimportDoc?.contact_id ?? undefined}
        defaultContactId={contactFilterId ?? undefined}
        defaultTypeDocument={
          stelliumDropImport?.defaultTypeDocument ?? rioReimportDoc?.type_document
        }
        initialUploadedFile={
          stelliumDropImport?.file ??
          (rioReimportDoc
            ? {
                path: rioReimportDoc.chemin_fichier,
                name: rioReimportDoc.nom_fichier,
                size: rioReimportDoc.taille_fichier,
              }
            : undefined)
        }
        initialExtractedData={stelliumDropImport?.extractedData}
        existingDocumentId={rioReimportDoc?.id}
      />

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  <span className="font-medium text-foreground">
                    {deleteTarget.nom_fichier}
                  </span>
                  . Le fichier sera retiré de la bibliothèque. Cette action est irréversible.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {contactDetailSheet}
    </div>
  );
}
