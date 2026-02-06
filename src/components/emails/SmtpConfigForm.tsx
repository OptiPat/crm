import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getSmtpConfig,
  saveSmtpConfig,
  testSmtpConnection,
  deleteSmtpConfig,
  type SmtpConfigInput,
} from "@/lib/api/tauri-email";
import { Mail, Check, X, TestTube } from "lucide-react";

interface SmtpConfigFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SmtpConfigForm({ open, onOpenChange }: SmtpConfigFormProps) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [formData, setFormData] = useState<SmtpConfigInput>({
    provider: "other",
    smtp_server: "",
    smtp_port: 587,
    username: "",
    password: "",
    from_name: "",
    from_email: "",
    use_tls: true,
  });

  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open]);

  const loadConfig = async () => {
    try {
      const config = await getSmtpConfig();
      if (config) {
        // Vérifier si un mot de passe existe (le backend ne le renvoie pas, mais on peut vérifier si la config existe)
        const passwordExists = config.smtp_server && config.username;
        setHasExistingPassword(!!passwordExists);
        
        setFormData({
          ...config,
          password: "", // Ne pas afficher le mot de passe réel
        });
      } else {
        setHasExistingPassword(false);
      }
    } catch (error) {
      console.error("Error loading SMTP config:", error);
      setHasExistingPassword(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    if (provider === "gmail") {
      setFormData({
        ...formData,
        provider,
        smtp_server: "smtp.gmail.com",
        smtp_port: 587,
        use_tls: true,
      });
    } else if (provider === "outlook") {
      setFormData({
        ...formData,
        provider,
        smtp_server: "smtp-mail.outlook.com",
        smtp_port: 587,
        use_tls: true,
      });
    } else {
      setFormData({
        ...formData,
        provider,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTestResult(null);

    try {
      await saveSmtpConfig(formData);
      setHasExistingPassword(true);
      // Réinitialiser le champ mot de passe après sauvegarde
      setFormData({ ...formData, password: "" });
      alert("Configuration SMTP enregistrée avec succès !");
    } catch (error) {
      console.error("Error saving SMTP config:", error);
      alert("Erreur lors de l'enregistrement : " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // D'abord enregistrer la configuration
      await saveSmtpConfig(formData);
      setHasExistingPassword(true);
      // Réinitialiser le champ mot de passe après sauvegarde
      setFormData({ ...formData, password: "" });
      
      // Puis tester la connexion
      const message = await testSmtpConnection();
      setTestResult({ success: true, message });
    } catch (error) {
      setTestResult({ success: false, message: String(error) });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer la configuration SMTP ?")) return;

    try {
      await deleteSmtpConfig();
      setFormData({
        provider: "other",
        smtp_server: "",
        smtp_port: 587,
        username: "",
        password: "",
        from_name: "",
        from_email: "",
        use_tls: true,
      });
      setHasExistingPassword(false);
      alert("Configuration supprimée");
    } catch (error) {
      console.error("Error deleting SMTP config:", error);
      alert("Erreur lors de la suppression");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuration Email (SMTP)</DialogTitle>
          <DialogDescription>
            Configurez votre compte email pour envoyer des emails depuis l'application
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Fournisseur */}
          <div className="space-y-2">
            <Label htmlFor="provider">Fournisseur d'email</Label>
            <Select value={formData.provider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gmail">Gmail</SelectItem>
                <SelectItem value="outlook">Outlook / Office 365</SelectItem>
                <SelectItem value="other">Autre (manuel)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Serveur SMTP */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_server">Serveur SMTP</Label>
              <Input
                id="smtp_server"
                value={formData.smtp_server}
                onChange={(e) => setFormData({ ...formData, smtp_server: e.target.value })}
                placeholder="smtp.gmail.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port">Port</Label>
              <Input
                id="smtp_port"
                type="number"
                value={formData.smtp_port}
                onChange={(e) => setFormData({ ...formData, smtp_port: parseInt(e.target.value) })}
                required
              />
            </div>
          </div>

          {/* Identifiants */}
          <div className="space-y-2">
            <Label htmlFor="username">Nom d'utilisateur / Email</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="votre@email.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder={hasExistingPassword ? "••••••••••••••••" : "Votre mot de passe"}
            />
            {hasExistingPassword && !formData.password && (
              <p className="text-xs text-green-600">
                Un mot de passe est déjà enregistré. Laissez vide pour le conserver.
              </p>
            )}
            {formData.password && (
              <p className="text-xs text-blue-600">
                Le mot de passe sera mis à jour.
              </p>
            )}
            {formData.provider === "gmail" && (
              <p className="text-xs text-yellow-600">
                Pour Gmail, utilisez un "mot de passe d'application" (pas votre mot de passe principal)
              </p>
            )}
          </div>

          {/* Informations d'envoi */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from_name">Nom d'expéditeur</Label>
              <Input
                id="from_name"
                value={formData.from_name}
                onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
                placeholder="Votre nom"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="from_email">Email d'expéditeur</Label>
              <Input
                id="from_email"
                type="email"
                value={formData.from_email}
                onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
                placeholder="votre@email.com"
                required
              />
            </div>
          </div>

          {/* Résultat du test */}
          {testResult && (
            <div
              className={`p-3 rounded-lg flex items-start gap-2 ${
                testResult.success
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              {testResult.success ? (
                <Check className="h-5 w-5 text-green-600 mt-0.5" />
              ) : (
                <X className="h-5 w-5 text-red-600 mt-0.5" />
              )}
              <p
                className={`text-sm ${
                  testResult.success ? "text-green-800" : "text-red-800"
                }`}
              >
                {testResult.message}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleDelete}>
              Supprimer
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testing}
              className="gap-2"
            >
              <TestTube className="h-4 w-4" />
              {testing ? "Test en cours..." : "Tester"}
            </Button>
            <Button type="submit" disabled={loading}>
              <Mail className="h-4 w-4 mr-2" />
              {loading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
