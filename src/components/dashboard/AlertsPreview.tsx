import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Bell } from "lucide-react";
import { getAlertesWithContacts, AlerteWithContact } from "@/lib/api/tauri-dashboard";

const CATEGORY_COLORS: Record<string, string> = {
  CLIENT: "bg-green-100 text-green-800",
  PROSPECT_CLIENT: "bg-blue-100 text-blue-800",
  PROSPECT_FILLEUL: "bg-cyan-100 text-cyan-800",
  SUSPECT_CLIENT: "bg-orange-100 text-orange-800",
  SUSPECT_FILLEUL: "bg-amber-100 text-amber-800",
};

const CATEGORY_LABELS: Record<string, string> = {
  CLIENT: "Client",
  PROSPECT_CLIENT: "Prospect client",
  PROSPECT_FILLEUL: "Prospect filleul",
  SUSPECT_CLIENT: "Suspect client",
  SUSPECT_FILLEUL: "Suspect filleul",
};

export function AlertsPreview() {
  const [alertes, setAlertes] = useState<AlerteWithContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getAlertesWithContacts(5);
      setAlertes(data);
    } catch (error) {
      console.error("Erreur lors du chargement des alertes:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "Jamais contacté";
    
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const handleViewContact = (_contactId: number) => {
    // TODO: Navigation vers la page de détail du contact
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Contacts à recontacter
        </CardTitle>
        <CardDescription>
          {alertes.length > 0 
            ? `${alertes.length} alerte${alertes.length > 1 ? 's' : ''} active${alertes.length > 1 ? 's' : ''}`
            : "Aucune alerte active"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Chargement...
          </div>
        ) : alertes.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Aucun contact à recontacter</p>
            <p className="text-sm mt-1">Tous vos contacts sont à jour !</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alertes.map((alerte) => (
              <div
                key={alerte.alerte_id}
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {alerte.contact_prenom} {alerte.contact_nom}
                    </p>
                    <Badge 
                      variant="secondary" 
                      className={CATEGORY_COLORS[alerte.contact_categorie] || "bg-gray-100 text-gray-800"}
                    >
                      {CATEGORY_LABELS[alerte.contact_categorie] || alerte.contact_categorie}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Dernier contact : {formatDate(alerte.date_dernier_contact)}
                  </p>
                  <p className="text-sm text-primary">
                    {alerte.message}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewContact(alerte.contact_id)}
                  className="ml-4"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Voir
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
