import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Upload, Search, Trash2, Filter, ExternalLink, FileText, FileSpreadsheet, Image, Paperclip, X } from "lucide-react";
import {
  getAllDocuments,
  deleteDocument,
  type Document,
} from "@/lib/api/tauri-documents";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { openDocumentFile } from "@/lib/api/tauri-system";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { textMatchesSearch } from "@/lib/search-utils";
import { requestOpenContact } from "@/lib/navigation/app-navigation";
import { toast } from "sonner";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeDocumentsChanged } from "@/lib/documents/document-events";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { getDocumentMetaLines } from "@/lib/documents/document-display";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import {
  consumeDocumentsContactFocus,
  setDocumentsContactFocus,
} from "@/lib/documents/documents-navigation";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";

type DocumentsProps = {
  onNavigate?: (page: string) => void;
  onOpenContact?: (contactId: number) => void;
};

export function Documents({ onNavigate, onOpenContact }: DocumentsProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [contactsById, setContactsById] = useState<Record<number, Contact>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [showUpload, setShowUpload] = useState(false);
  const [contactFilterId, setContactFilterId] = useState<number | null>(null);
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

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (contactFilterId != null && doc.contact_id !== contactFilterId) {
        return false;
      }
      const client = doc.contact_id ? contactsById[doc.contact_id] : undefined;
      const clientLabel = client
        ? `${client.prenom} ${client.nom}`
        : "";
      const matchesSearch = textMatchesSearch(
        searchQuery,
        doc.nom_fichier,
        clientLabel
      );
      const matchesType = typeFilter === "ALL" || doc.type_document === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [documents, searchQuery, typeFilter, contactsById, contactFilterId]);

  const contactFilterLabel = useMemo(() => {
    if (contactFilterId == null) return null;
    const client = contactsById[contactFilterId];
    if (client) return `${client.prenom} ${client.nom}`;
    return `Contact #${contactFilterId}`;
  }, [contactFilterId, contactsById]);

  const handleDeleteDocument = async (id: number) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce document ?")) {
      try {
        await deleteDocument(id);
        await loadDocuments();
      } catch (error) {
        console.error("Error deleting document:", error);
        toast.error("Erreur lors de la suppression");
      }
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
    if (onOpenContact) {
      onOpenContact(contactId);
    } else if (onNavigate) {
      requestOpenContact(contactId, {
        setCurrentPage: onNavigate,
        currentPage: "documents",
      });
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "IDENTITE":
        return "bg-blue-100 text-blue-800";
      case "FISCAL":
        return "bg-green-100 text-green-800";
      case "PATRIMOINE":
        return "bg-purple-100 text-purple-800";
      case "CONTRAT":
        return "bg-orange-100 text-orange-800";
      case "RELEVE":
        return "bg-cyan-100 text-cyan-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeIcon = (type: string) => {
    const mimeType = type || "";
    const className = "h-8 w-8 text-muted-foreground";
    if (mimeType.includes("pdf")) return <FileText className={className} aria-hidden />;
    if (mimeType.includes("word") || mimeType.includes("doc")) return <FileText className={className} aria-hidden />;
    if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) {
      return <FileSpreadsheet className={className} aria-hidden />;
    }
    if (mimeType.includes("image")) return <Image className={className} aria-hidden />;
    return <Paperclip className={className} aria-hidden />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Documents
          </h2>
          <p className="text-muted-foreground">
            Gérez les documents de vos clients
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowUpload(true)}>
          <Upload className="h-4 w-4" />
          Importer un document
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Bibliothèque de documents</CardTitle>
                <CardDescription>
                  {filteredDocuments.length} document{filteredDocuments.length > 1 ? "s" : ""} sur {documents.length}
                </CardDescription>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un document ou un client..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[220px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous les types</SelectItem>
                  <SelectItem value="IDENTITE">{getDocumentTypeLabel("IDENTITE")}</SelectItem>
                  <SelectItem value="FISCAL">{getDocumentTypeLabel("FISCAL")}</SelectItem>
                  <SelectItem value="PATRIMOINE">{getDocumentTypeLabel("PATRIMOINE")}</SelectItem>
                  <SelectItem value="CONTRAT">{getDocumentTypeLabel("CONTRAT")}</SelectItem>
                  <SelectItem value="RELEVE">{getDocumentTypeLabel("RELEVE")}</SelectItem>
                  <SelectItem value="AUTRE">{getDocumentTypeLabel("AUTRE")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contactFilterId != null && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <span>
                Documents de <strong>{contactFilterLabel}</strong>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {onNavigate && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    onClick={() => openClient(contactFilterId)}
                  >
                    Voir la fiche
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setContactFilterId(null)}
                >
                  <X className="h-3.5 w-3.5" />
                  Tous les documents
                </Button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex p-4 bg-muted rounded-full mb-4">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery || typeFilter !== "ALL" || contactFilterId != null
                  ? "Aucun document trouvé"
                  : "Aucun document"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || typeFilter !== "ALL" || contactFilterId != null
                  ? "Essayez de modifier vos critères de recherche"
                  : "Importez vos premiers documents"}
              </p>
              {!searchQuery && typeFilter === "ALL" && contactFilterId == null && (
                <Button onClick={() => setShowUpload(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importer
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocuments.map((doc) => {
                const client =
                  doc.contact_id != null ? contactsById[doc.contact_id] : undefined;
                return (
                  <div
                    key={doc.id}
                    className="p-4 border border-border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="shrink-0">
                          {getTypeIcon(doc.mime_type || "")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{doc.nom_fichier}</h3>
                            <Badge className={getTypeColor(doc.type_document)}>
                              {getDocumentTypeLabel(doc.type_document)}
                            </Badge>
                          </div>
                          {client && doc.contact_id != null && (
                            <button
                              type="button"
                              className="text-sm text-primary hover:underline mb-1"
                              onClick={() => openClient(doc.contact_id!)}
                            >
                              Client : {client.prenom} {client.nom}
                            </button>
                          )}
                          {!client && doc.contact_id == null && (
                            <p className="text-sm text-muted-foreground mb-1">
                              Sans client lié
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span>{formatFileSize(doc.taille_fichier)}</span>
                            {getDocumentMetaLines(doc).map((line) => (
                              <span key={line.label}>
                                {line.label} : {line.value}
                              </span>
                            ))}
                          </div>
                          {doc.notes && (
                            <p className="text-sm text-muted-foreground mt-2">{doc.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          title="Ouvrir le fichier"
                          onClick={() => void handleOpenFile(doc)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => void handleDeleteDocument(doc.id)}
                          className="text-red-600 hover:text-red-700"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <DocumentUpload
        open={showUpload}
        onOpenChange={setShowUpload}
        onSuccess={loadDocuments}
        defaultContactId={contactFilterId ?? undefined}
      />
    </div>
  );
}
