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
import { useAppBranding } from "@/components/app-branding/AppBrandingProvider";
import { User, Check } from "lucide-react";
import {
  getCgpConfig,
  saveCgpConfig,
  completeWizard,
  type CgpConfig,
} from "@/lib/api/tauri-settings";

interface SetupWizardProps {
  onWizardComplete: () => void;
}

export function SetupWizard({ onWizardComplete }: SetupWizardProps) {
  const { displayName } = useAppBranding();
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    const loadData = async () => {
      try {
        const config = await getCgpConfig();
        if (config) {
          setCgpConfig(config);
        }
      } catch (error) {
        console.error("Error loading wizard data:", error);
      }
    };

    void loadData();
  }, []);

  const handleFinish = async () => {
    setLoading(true);
    try {
      await saveCgpConfig({
        ...cgpConfig,
        wizard_step: 1,
      });
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
          Configuration de {displayName}
        </h1>
        <p className="text-muted-foreground">
          Ces informations apparaîtront dans vos documents et emails.
          Connexion mail et partenaires se règlent ensuite dans Paramètres.
        </p>
      </div>

      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <div className="mx-auto p-3 bg-primary/10 rounded-full w-fit mb-2">
            <User className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Vos informations</CardTitle>
          <CardDescription>
            Vous pourrez les modifier à tout moment dans Paramètres → Profil.
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
                placeholder="Nom (ex. NOM1)"
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
          <Button onClick={() => void handleFinish()} disabled={loading} className="gap-2">
            {loading ? (
              "Enregistrement..."
            ) : (
              <>
                <Check className="h-4 w-4" />
                Terminer
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
