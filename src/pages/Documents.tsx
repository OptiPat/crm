import { useEffect, useState } from "react";
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
import { Upload, Search, Trash2, Filter } from "lucide-react";
import { getAllDocuments, deleteDocument, type Document } from "@/lib/api/tauri-documents";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { textMatchesSearch } from "@/lib/search-utils";

export function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const data = await getAllDocuments();
      setDocuments(data);
    } catch (error) {
      console.error("Error loading documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter((doc) => {
    // Filtre de recherche textuelle
    const matchesSearch = textMatchesSearch(searchQuery, doc.nom_fichier);

    // Filtre par type
    const matchesType = typeFilter === "ALL" || doc.type_document === typeFilter;

    return matchesSearch && matchesType;
  });

  const handleDeleteDocument = async (id: number) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce document ?")) {
      try {
        await deleteDocument(id);
        await loadDocuments();
      } catch (error) {
        console.error("Error deleting document:", error);
        alert("Erreur lors de la suppression: " + String(error));
      }
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
    if (mimeType.includes("pdf")) return "📄";
    if (mimeType.includes("word") || mimeType.includes("doc")) return "📝";
    if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "📊";
    if (mimeType.includes("image")) return "🖼️";
    return "📎";
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString("fr-FR");
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

            {/* Barre de recherche et filtres */}
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un document..."
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
                  <SelectItem value="IDENTITE">Pièce d'identité</SelectItem>
                  <SelectItem value="FISCAL">Document fiscal</SelectItem>
                  <SelectItem value="PATRIMOINE">Document patrimonial</SelectItem>
                  <SelectItem value="CONTRAT">Contrat</SelectItem>
                  <SelectItem value="RELEVE">Relevé</SelectItem>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
                {searchQuery || typeFilter !== "ALL"
                  ? "Aucun document trouvé"
                  : "Aucun document"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || typeFilter !== "ALL"
                  ? "Essayez de modifier vos critères de recherche"
                  : "Importez vos premiers documents"}
              </p>
              {!searchQuery && typeFilter === "ALL" && (
                <Button onClick={() => setShowUpload(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importer
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="text-3xl">{getTypeIcon(doc.mime_type || "")}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{doc.nom_fichier}</h3>
                          <Badge className={getTypeColor(doc.type_document)}>
                            {doc.type_document}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{formatFileSize(doc.taille_fichier)}</span>
                          <span>Ajouté le {formatDate(doc.created_at)}</span>
                          {doc.date_document && (
                            <span>Date: {new Date(doc.date_document).toLocaleDateString("fr-FR")}</span>
                          )}
                        </div>
                        {doc.notes && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {doc.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Composant d'upload */}
      <DocumentUpload
        open={showUpload}
        onOpenChange={setShowUpload}
        onSuccess={loadDocuments}
      />
    </div>
  );
}
