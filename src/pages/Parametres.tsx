import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Database, Bell, User, Mail } from "lucide-react";
import { SmtpConfigForm } from "@/components/emails/SmtpConfigForm";
import { useState } from "react";

export function Parametres() {
  const [showSmtpConfig, setShowSmtpConfig] = useState(false);
  
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
