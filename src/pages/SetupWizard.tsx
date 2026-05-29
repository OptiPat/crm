import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_DISPLAY_NAME } from "@/lib/app-branding";
import {
  User,
  Mail,
  Building2,
  FileSpreadsheet,
  Check,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  TestTube,
  Upload,
  X,
} from "lucide-react";
import {
  getCgpConfig,
  saveCgpConfig,
  completeWizard,
  updateWizardStep,
  type CgpConfig,
} from "@/lib/api/tauri-settings";
import {
  getSmtpConfig,
  saveSmtpConfig,
  testSmtpConnection,
  type SmtpConfigInput,
} from "@/lib/api/tauri-email";
import { getAllPartenaires, createPartenaire, type Partenaire, type NewPartenaire } from "@/lib/api/tauri-partenaires";

interface SetupWizardProps {
  onWizardComplete: () => void;
}

// Liste des types de partenaires disponibles
const TYPES_PARTENAIRES = [
  "SCPI",
  "Assureur",
  "Banque",
  "Notaire",
  "Avocat",
  "Expert-comptable",
  "Autre",
];

// Presets de partenaires populaires
const PARTENAIRES_POPULAIRES = [
  { raison_sociale: "Corum", type_partenaire: "SCPI" },
  { raison_sociale: "Primonial", type_partenaire: "SCPI" },
  { raison_sociale: "Sofidy", type_partenaire: "SCPI" },
  { raison_sociale: "Swiss Life", type_partenaire: "Assureur" },
  { raison_sociale: "Generali", type_partenaire: "Assureur" },
  { raison_sociale: "Suravenir", type_partenaire: "Assureur" },
  { raison_sociale: "Vie Plus", type_partenaire: "Assureur" },
  { raison_sociale: "Apicil", type_partenaire: "Assureur" },
];

export function SetupWizard({ onWizardComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Étape 1 : Informations CGP
  const [cgpConfig, setCgpConfig] = useState<CgpConfig>({
    nom: "",
    prenom: "",
    cabinet: "",
    email: "",
    telephone: "",
    logo_path: "",
    wizard_completed: false,
    wizard_step: 1,
  });
  
  // Étape 2 : Configuration SMTP
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfigInput>({
    provider: "other",
    smtp_server: "",
    smtp_port: 587,
    username: "",
    password: "",
    from_name: "",
    from_email: "",
    use_tls: true,
  });
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Étape 3 : Partenaires
  const [existingPartenaires, setExistingPartenaires] = useState<Partenaire[]>([]);
  const [selectedPartenaires, setSelectedPartenaires] = useState<string[]>([]);
  const [newPartenaireNom, setNewPartenaireNom] = useState("");
  const [newPartenaireType, setNewPartenaireType] = useState("SCPI");
  
  // Étape 4 : Import
  const [importChoice, setImportChoice] = useState<"import" | "empty" | null>(null);

  // Charger les données existantes au montage
  useEffect(() => {
    const loadData = async () => {
      try {
        // Charger la config CGP
        const config = await getCgpConfig();
        if (config) {
          setCgpConfig({
            ...config,
            wizard_step: config.wizard_step || 1,
          });
          setCurrentStep(config.wizard_step || 1);
        }
        
        // Charger la config SMTP
        const smtp = await getSmtpConfig();
        if (smtp) {
          setSmtpConfig({
            ...smtp,
            password: "", // Ne pas afficher le mot de passe
          });
        }
        
        // Charger les partenaires existants
        const partenaires = await getAllPartenaires();
        setExistingPartenaires(partenaires);
        setSelectedPartenaires(partenaires.map(p => p.raison_sociale));
      } catch (error) {
        console.error("Error loading wizard data:", error);
      }
    };
    
    loadData();
  }, []);

  // Sauvegarder automatiquement l'étape courante
  useEffect(() => {
    updateWizardStep(currentStep).catch(console.error);
  }, [currentStep]);

  // Handlers pour chaque étape
  const handleStep1Next = async () => {
    setLoading(true);
    try {
      await saveCgpConfig({
        ...cgpConfig,
        wizard_step: 2,
      });
      setCurrentStep(2);
    } catch (error) {
      console.error("Error saving CGP config:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    if (provider === "gmail") {
      setSmtpConfig({
        ...smtpConfig,
        provider,
        smtp_server: "smtp.gmail.com",
        smtp_port: 587,
        use_tls: true,
      });
    } else if (provider === "outlook") {
      setSmtpConfig({
        ...smtpConfig,
        provider,
        smtp_server: "smtp-mail.outlook.com",
        smtp_port: 587,
        use_tls: true,
      });
    } else if (provider === "ovh") {
      setSmtpConfig({
        ...smtpConfig,
        provider,
        smtp_server: "ssl0.ovh.net",
        smtp_port: 465,
        use_tls: true,
      });
    } else {
      setSmtpConfig({
        ...smtpConfig,
        provider,
      });
    }
  };

  const handleTestSmtp = async () => {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    
    try {
      // Sauvegarder d'abord
      await saveSmtpConfig(smtpConfig);
      // Puis tester
      const message = await testSmtpConnection();
      setSmtpTestResult({ success: true, message });
    } catch (error) {
      setSmtpTestResult({ success: false, message: String(error) });
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleStep2Next = async () => {
    setLoading(true);
    try {
      // Sauvegarder la config SMTP si remplie
      if (smtpConfig.smtp_server && smtpConfig.username) {
        await saveSmtpConfig(smtpConfig);
      }
      await updateWizardStep(3);
      setCurrentStep(3);
    } catch (error) {
      console.error("Error saving SMTP config:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPartenaire = async () => {
    if (!newPartenaireNom.trim()) return;
    
    try {
      const newPartenaire: NewPartenaire = {
        raison_sociale: newPartenaireNom.trim(),
        type_partenaire: newPartenaireType,
      };
      
      const created = await createPartenaire(newPartenaire);
      setExistingPartenaires([...existingPartenaires, created]);
      setSelectedPartenaires([...selectedPartenaires, created.raison_sociale]);
      setNewPartenaireNom("");
    } catch (error) {
      console.error("Error creating partenaire:", error);
    }
  };

  const handleSelectPopularPartenaire = async (partenaire: { raison_sociale: string; type_partenaire: string }) => {
    // Vérifier si déjà existant
    const exists = existingPartenaires.some(p => 
      p.raison_sociale.toLowerCase() === partenaire.raison_sociale.toLowerCase()
    );
    
    if (exists) {
      // Toggle selection
      if (selectedPartenaires.includes(partenaire.raison_sociale)) {
        setSelectedPartenaires(selectedPartenaires.filter(p => p !== partenaire.raison_sociale));
      } else {
        setSelectedPartenaires([...selectedPartenaires, partenaire.raison_sociale]);
      }
    } else {
      // Créer et sélectionner
      try {
        const newPartenaire: NewPartenaire = {
          raison_sociale: partenaire.raison_sociale,
          type_partenaire: partenaire.type_partenaire,
        };
        
        const created = await createPartenaire(newPartenaire);
        setExistingPartenaires([...existingPartenaires, created]);
        setSelectedPartenaires([...selectedPartenaires, created.raison_sociale]);
      } catch (error) {
        console.error("Error creating partenaire:", error);
      }
    }
  };

  const handleStep3Next = async () => {
    await updateWizardStep(4);
    setCurrentStep(4);
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await completeWizard();
      onWizardComplete();
    } catch (error) {
      console.error("Error completing wizard:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-serif font-bold text-primary mb-2">
          Configuration de {APP_DISPLAY_NAME}
        </h1>
        <p className="text-muted-foreground">
          Quelques étapes pour personnaliser votre application
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                step < currentStep
                  ? "bg-green-500 text-white"
                  : step === currentStep
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step < currentStep ? <Check className="h-5 w-5" /> : step}
            </div>
            {step < 4 && (
              <div
                className={`w-12 h-1 mx-1 rounded ${
                  step < currentStep ? "bg-green-500" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Étape 1 : Vos informations */}
      {currentStep === 1 && (
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto p-3 bg-primary/10 rounded-full w-fit mb-2">
              <User className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Vos informations</CardTitle>
            <CardDescription>
              Ces informations apparaîtront dans vos documents et emails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prenom">Prénom</Label>
                <Input
                  id="prenom"
                  value={cgpConfig.prenom || ""}
                  onChange={(e) => setCgpConfig({ ...cgpConfig, prenom: e.target.value })}
                  placeholder="Jean"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nom">Nom</Label>
                <Input
                  id="nom"
                  value={cgpConfig.nom || ""}
                  onChange={(e) => setCgpConfig({ ...cgpConfig, nom: e.target.value })}
                  placeholder="NOM1"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="cabinet">Cabinet / Société</Label>
              <Input
                id="cabinet"
                value={cgpConfig.cabinet || ""}
                onChange={(e) => setCgpConfig({ ...cgpConfig, cabinet: e.target.value })}
                placeholder="Cabinet Patrimoine Conseil"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email professionnel</Label>
                <Input
                  id="email"
                  type="email"
                  value={cgpConfig.email || ""}
                  onChange={(e) => setCgpConfig({ ...cgpConfig, email: e.target.value })}
                  placeholder="contact@cabinet.fr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telephone">Téléphone</Label>
                <Input
                  id="telephone"
                  value={cgpConfig.telephone || ""}
                  onChange={(e) => setCgpConfig({ ...cgpConfig, telephone: e.target.value })}
                  placeholder="01 23 45 67 89"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleStep1Next} disabled={loading}>
              {loading ? "Enregistrement..." : "Continuer"}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Étape 2 : Configuration Email */}
      {currentStep === 2 && (
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto p-3 bg-primary/10 rounded-full w-fit mb-2">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Configuration email</CardTitle>
            <CardDescription>
              Configurez votre email pour envoyer des messages depuis l'application
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Fournisseur</Label>
              <Select value={smtpConfig.provider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gmail">Gmail</SelectItem>
                  <SelectItem value="outlook">Outlook / Office 365</SelectItem>
                  <SelectItem value="ovh">OVH</SelectItem>
                  <SelectItem value="other">Autre (manuel)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp_server">Serveur SMTP</Label>
                <Input
                  id="smtp_server"
                  value={smtpConfig.smtp_server}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, smtp_server: e.target.value })}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp_port">Port</Label>
                <Input
                  id="smtp_port"
                  type="number"
                  value={smtpConfig.smtp_port}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, smtp_port: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Nom d'utilisateur / Email</Label>
              <Input
                id="username"
                value={smtpConfig.username}
                onChange={(e) => setSmtpConfig({ ...smtpConfig, username: e.target.value })}
                placeholder="votre@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={smtpConfig.password}
                onChange={(e) => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
                placeholder="Votre mot de passe"
              />
              {smtpConfig.provider === "gmail" && (
                <p className="text-xs text-yellow-600">
                  Pour Gmail, utilisez un "mot de passe d'application"
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from_name">Nom d'expéditeur</Label>
                <Input
                  id="from_name"
                  value={smtpConfig.from_name}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, from_name: e.target.value })}
                  placeholder="Votre nom"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="from_email">Email d'expéditeur</Label>
                <Input
                  id="from_email"
                  type="email"
                  value={smtpConfig.from_email}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, from_email: e.target.value })}
                  placeholder="votre@email.com"
                />
              </div>
            </div>

            {smtpTestResult && (
              <div
                className={`p-3 rounded-lg flex items-start gap-2 ${
                  smtpTestResult.success
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                {smtpTestResult.success ? (
                  <Check className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <X className="h-5 w-5 text-red-600 mt-0.5" />
                )}
                <p
                  className={`text-sm ${
                    smtpTestResult.success ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {smtpTestResult.message}
                </p>
              </div>
            )}

            {smtpConfig.smtp_server && smtpConfig.username && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTestSmtp}
                disabled={smtpTesting}
                className="w-full"
              >
                <TestTube className="h-4 w-4 mr-2" />
                {smtpTesting ? "Test en cours..." : "Tester la connexion"}
              </Button>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="ghost" onClick={() => setCurrentStep(1)}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep(3)}>
                <SkipForward className="h-4 w-4 mr-2" />
                Passer
              </Button>
              <Button onClick={handleStep2Next} disabled={loading}>
                {loading ? "Enregistrement..." : "Continuer"}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* Étape 3 : Partenaires */}
      {currentStep === 3 && (
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto p-3 bg-primary/10 rounded-full w-fit mb-2">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Vos partenaires</CardTitle>
            <CardDescription>
              Ajoutez vos partenaires fréquents (SCPI, assureurs...)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Partenaires populaires */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Partenaires populaires</Label>
              <div className="flex flex-wrap gap-2">
                {PARTENAIRES_POPULAIRES.map((p) => {
                  const isSelected = selectedPartenaires.includes(p.raison_sociale);
                  return (
                    <Button
                      key={p.raison_sociale}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleSelectPopularPartenaire(p)}
                      className="gap-1"
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      {p.raison_sociale}
                      <span className="text-xs opacity-70">({p.type_partenaire})</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Ajouter un partenaire */}
            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Ajouter un partenaire</Label>
              <div className="flex gap-2">
                <Input
                  value={newPartenaireNom}
                  onChange={(e) => setNewPartenaireNom(e.target.value)}
                  placeholder="Nom du partenaire"
                  className="flex-1"
                />
                <Select value={newPartenaireType} onValueChange={setNewPartenaireType}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES_PARTENAIRES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={handleAddPartenaire} disabled={!newPartenaireNom.trim()}>
                  Ajouter
                </Button>
              </div>
            </div>

            {/* Liste des partenaires ajoutés */}
            {existingPartenaires.length > 0 && (
              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">
                  Partenaires ajoutés ({existingPartenaires.length})
                </Label>
                <div className="flex flex-wrap gap-2">
                  {existingPartenaires.map((p) => (
                    <div
                      key={p.id}
                      className="px-3 py-1 bg-muted rounded-full text-sm flex items-center gap-1"
                    >
                      <Check className="h-3 w-3 text-green-600" />
                      {p.raison_sociale}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="ghost" onClick={() => setCurrentStep(2)}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep(4)}>
                <SkipForward className="h-4 w-4 mr-2" />
                Passer
              </Button>
              <Button onClick={handleStep3Next}>
                Continuer
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* Étape 4 : Import de données */}
      {currentStep === 4 && (
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto p-3 bg-primary/10 rounded-full w-fit mb-2">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Import de données</CardTitle>
            <CardDescription>
              Importez vos données existantes ou commencez à zéro
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setImportChoice("import")}
                className={`p-6 border-2 rounded-lg text-left transition-all hover:border-primary ${
                  importChoice === "import"
                    ? "border-primary bg-primary/5"
                    : "border-muted"
                }`}
              >
                <Upload className="h-8 w-8 mb-3 text-primary" />
                <h3 className="font-medium mb-1">Importer un fichier Excel</h3>
                <p className="text-sm text-muted-foreground">
                  Importez vos clients depuis un fichier Excel
                </p>
              </button>
              
              <button
                type="button"
                onClick={() => setImportChoice("empty")}
                className={`p-6 border-2 rounded-lg text-left transition-all hover:border-primary ${
                  importChoice === "empty"
                    ? "border-primary bg-primary/5"
                    : "border-muted"
                }`}
              >
                <FileSpreadsheet className="h-8 w-8 mb-3 text-muted-foreground" />
                <h3 className="font-medium mb-1">Commencer à vide</h3>
                <p className="text-sm text-muted-foreground">
                  Créez vos contacts manuellement
                </p>
              </button>
            </div>

            {importChoice === "import" && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Vous pourrez importer vos données depuis la page <strong>Contacts</strong> une fois dans l'application.
                  Un modèle Excel est disponible pour vous aider à formater vos données.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="ghost" onClick={() => setCurrentStep(3)}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <Button
              onClick={handleFinish}
              disabled={loading || !importChoice}
              className="gap-2"
            >
              {loading ? (
                "Finalisation..."
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Terminer la configuration
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
