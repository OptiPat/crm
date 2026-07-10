import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { activateLicense, getLicenseStatus, startLicenseTrial } from "@/lib/api/tauri-license";
import { KeyRound, Sparkles } from "lucide-react";
import { useAppBranding } from "@/components/app-branding/AppBrandingProvider";

interface LicenseActivationProps {
  onComplete: () => void;
}

export function LicenseActivation({ onComplete }: LicenseActivationProps) {
  const { displayName } = useAppBranding();
  const [clientEmail, setClientEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [cabinet, setCabinet] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"trial" | "key">("trial");

  useEffect(() => {
    void getLicenseStatus()
      .then((status) => {
        if (status.client_email) setClientEmail(status.client_email);
        if (status.client_name) setClientName(status.client_name);
        if (status.cabinet) setCabinet(status.cabinet);
        if (!status.is_valid) setMode("key");
      })
      .catch(() => {});
  }, []);

  const emailValid = useMemo(() => clientEmail.trim().includes("@"), [clientEmail]);

  const handleTrial = async () => {
    setError("");
    setLoading(true);
    try {
      await startLicenseTrial({
        clientEmail,
        clientName: clientName || undefined,
        cabinet: cabinet || undefined,
      });
      onComplete();
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    setError("");
    setLoading(true);
    try {
      await activateLicense({
        licenseKey,
        clientEmail,
        clientName: clientName || undefined,
        cabinet: cabinet || undefined,
      });
      onComplete();
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-primary/10 rounded-full mb-4">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-primary mb-2">
            Activation de {displayName}
          </h1>
          <p className="text-muted-foreground">
            Identifiez cette installation pour activer votre accès.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Choisissez votre mode d&apos;accès</CardTitle>
            <CardDescription>
              Accès complet pour l&apos;instant — la facturation sera activée plus tard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="license-email">Email *</Label>
                <Input
                  id="license-email"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="conseiller@cabinet-exemple.fr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license-name">Nom</Label>
                <Input
                  id="license-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Jean DUPONT"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="license-cabinet">Cabinet</Label>
              <Input
                id="license-cabinet"
                value={cabinet}
                onChange={(e) => setCabinet(e.target.value)}
                placeholder="Cabinet Exemple"
              />
            </div>

            <Tabs value={mode} onValueChange={(value) => setMode(value as "trial" | "key")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="trial">Accès gratuit</TabsTrigger>
                <TabsTrigger value="key">Clé de licence</TabsTrigger>
              </TabsList>
              <TabsContent value="trial" className="space-y-4 pt-2">
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground flex gap-3">
                  <Sparkles className="h-5 w-5 shrink-0 text-primary" />
                  <p>
                    Accès complet sans limite de durée pour l&apos;instant. Une clé de licence
                    sera demandée lorsque la facturation sera en place.
                  </p>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  disabled={loading || !emailValid}
                  onClick={() => void handleTrial()}
                >
                  {loading ? "Activation…" : "Activer l'accès gratuit"}
                </Button>
              </TabsContent>
              <TabsContent value="key" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="license-key">Clé de licence</Label>
                  <Input
                    id="license-key"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                    placeholder="ANNU-2706-XXXX-XXXX"
                  />
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  disabled={loading || !emailValid || licenseKey.trim().length < 10}
                  onClick={() => void handleActivate()}
                >
                  {loading ? "Vérification…" : "Activer la licence"}
                </Button>
              </TabsContent>
            </Tabs>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
