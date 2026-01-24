import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Database, Bell, User, Mail, Trash2, Search, X } from "lucide-react";
import { SmtpConfigForm } from "@/components/emails/SmtpConfigForm";
import { useState } from "react";
import { cleanupOrphanedData, getAllContacts, deleteContact, type Contact } from "@/lib/api/tauri-contacts";

export function Parametres() {
  const [showSmtpConfig, setShowSmtpConfig] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  
  // 🔍 Recherche et suppression de contacts
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearchContacts = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      const allContacts = await getAllContacts();
      const query = searchQuery.toLowerCase();
      const results = allContacts.filter(c => 
        c.nom.toLowerCase().includes(query) || 
        c.prenom.toLowerCase().includes(query)
      );
      setSearchResults(results);
    } catch (error) {
      console.error("Erreur recherche:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteFoundContact = async (contact: Contact) => {
    if (!confirm(`🗑️ Supprimer définitivement ${contact.prenom} ${contact.nom} ?\n\nCette action est irréversible.`)) {
      return;
    }
    
    try {
      await deleteContact(contact.id);
      // Retirer de la liste des résultats
      setSearchResults(prev => prev.filter(c => c.id !== contact.id));
      alert(`✅ ${contact.prenom} ${contact.nom} supprimé`);
    } catch (error) {
      console.error("Erreur suppression:", error);
      alert("❌ Erreur lors de la suppression");
    }
  };

  const handleCleanupOrphaned = async () => {
    if (!confirm("⚠️ Voulez-vous nettoyer les données orphelines ?\n\nCeci supprimera :\n- Les foyers sans membres\n- Les investissements sans contact ni foyer valide")) {
      return;
    }
    
    setCleaningUp(true);
    try {
      const [foyersDeleted, investmentsDeleted] = await cleanupOrphanedData();
      alert(`✅ Nettoyage terminé !\n\n🏠 ${foyersDeleted} foyer(s) orphelin(s) supprimé(s)\n💰 ${investmentsDeleted} investissement(s) orphelin(s) supprimé(s)`);
    } catch (error) {
      console.error("Erreur nettoyage:", error);
      alert("❌ Erreur lors du nettoyage : " + error);
    } finally {
      setCleaningUp(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-serif font-bold text-primary mb-2">
          Paramètres
        </h2>
        <p className="text-muted-foreground">
          Configurez votre application
        </p>
      </div>

      {/* Profil */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <CardTitle>Profil utilisateur</CardTitle>
          </div>
          <CardDescription>
            Informations personnelles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nom">Nom</Label>
              <Input id="nom" placeholder="Votre nom" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prenom">Prénom</Label>
              <Input id="prenom" placeholder="Votre prénom" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="votre@email.com" />
          </div>
          <Button>Enregistrer</Button>
        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <CardTitle>Sécurité</CardTitle>
          </div>
          <CardDescription>
            Gérez votre mot de passe et vos accès
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline">
            Changer le mot de passe
          </Button>
          <Button variant="outline">
            Afficher la clé de récupération
          </Button>
        </CardContent>
      </Card>

      {/* Base de données */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle>Base de données</CardTitle>
          </div>
          <CardDescription>
            Gestion des données
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm font-medium mb-1">Emplacement</div>
            <div className="text-xs text-muted-foreground font-mono">
              %USERPROFILE%\AppData\Roaming\com.patrimoine-crm.app\patrimoine-crm.db
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              Exporter la base de données
            </Button>
            <Button variant="outline">
              Importer des données
            </Button>
          </div>
          
          {/* 🔥 Nettoyage des données orphelines */}
          <div className="border-t pt-4 mt-4">
            <div className="text-sm font-medium mb-2">🧹 Maintenance</div>
            <p className="text-xs text-muted-foreground mb-3">
              Supprimer les données orphelines (foyers sans membres, investissements sans contact)
            </p>
            <Button 
              variant="destructive" 
              onClick={handleCleanupOrphaned}
              disabled={cleaningUp}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {cleaningUp ? "Nettoyage en cours..." : "Nettoyer les données orphelines"}
            </Button>
          </div>
          
          {/* 🔍 Recherche et suppression de contacts */}
          <div className="border-t pt-4 mt-4">
            <div className="text-sm font-medium mb-2">🔍 Rechercher et supprimer un contact</div>
            <p className="text-xs text-muted-foreground mb-3">
              Trouver un contact par nom/prénom et le supprimer (utile pour les doublons)
            </p>
            
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="Nom ou prénom..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchContacts()}
                className="max-w-xs"
              />
              <Button onClick={handleSearchContacts} disabled={searching}>
                <Search className="h-4 w-4 mr-2" />
                {searching ? "Recherche..." : "Rechercher"}
              </Button>
              {searchResults.length > 0 && (
                <Button variant="ghost" onClick={() => setSearchResults([])}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            {/* Résultats de recherche */}
            {searchResults.length > 0 && (
              <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                {searchResults.map((contact) => (
                  <div key={contact.id} className="flex items-center justify-between p-2 hover:bg-muted/50">
                    <div>
                      <span className="font-medium">{contact.prenom} {contact.nom}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {contact.categorie || "AUCUN"}
                        {contact.filleul_categorie && ` • ${contact.filleul_categorie}`}
                      </span>
                      {contact.email && (
                        <span className="text-xs text-muted-foreground ml-2">• {contact.email}</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteFoundContact(contact)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            
            {searchResults.length === 0 && searchQuery && !searching && (
              <p className="text-xs text-muted-foreground">Aucun contact trouvé pour "{searchQuery}"</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email / SMTP */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle>Configuration Email (SMTP)</CardTitle>
          </div>
          <CardDescription>
            Configurez votre compte email pour envoyer des emails depuis l'application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setShowSmtpConfig(true)}>
            Configurer mon compte email
          </Button>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>
            Alertes et rappels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configuration des notifications à venir
          </p>
        </CardContent>
      </Card>

      {/* Formulaire de configuration SMTP */}
      <SmtpConfigForm
        open={showSmtpConfig}
        onOpenChange={setShowSmtpConfig}
      />
    </div>
  );
}
