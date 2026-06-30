import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Toaster } from "sonner";
import { SetupPassword } from "@/pages/SetupPassword";
import { SetupWizard } from "@/pages/SetupWizard";
import { UnlockScreen } from "@/pages/UnlockScreen";
import { Layout } from "@/components/layout/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Contacts } from "@/pages/Contacts";
import { Familles } from "@/pages/Familles";
import { Foyers } from "@/pages/Foyers";
import { Prescripteurs } from "@/pages/Prescripteurs";
import { Partenaires } from "@/pages/Partenaires";
import { Investissements } from "@/pages/Investissements";
import { Documents } from "@/pages/Documents";
import { SouscriptionCif } from "@/pages/SouscriptionCif";
import { Interactions } from "@/pages/Interactions";
import { Taches } from "@/pages/Taches";
import { Parametres } from "@/pages/Parametres";
import { TemplatesEmail } from "@/pages/TemplatesEmail";
import { Suivi } from "@/pages/Suivi";
import { Etiquettes } from "@/pages/Etiquettes";
import { Newsletter } from "@/pages/Newsletter";
import { AppBrandingProvider } from "@/components/app-branding/AppBrandingProvider";
import { ErrorBoundary } from "@/components/contacts/ErrorBoundary";
import { AppUpdateProvider } from "@/components/system/app-update-context";
import { isWizardCompleted } from "@/lib/api/tauri-settings";
import { seedDefaultEtiquettes } from "@/lib/api/tauri-etiquettes";
import { seedDefaultEmailTemplates } from "@/lib/api/tauri-templates-email";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";
import { requestOpenContact } from "@/lib/navigation/app-navigation";
import type { ContactDetailTabHint } from "@/lib/investissements/investissement-navigation";

function AppInner() {
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const ETIQUETTES_RECALC_SESSION_KEY = "crm_etiquettes_recalc_done";
  const etiquettesRecalcDone = useRef(
    sessionStorage.getItem("crm_etiquettes_recalc_done") === "1"
  );

  useEffect(() => {
    // Vérifier si c'est le premier lancement
    const checkFirstLaunch = async () => {
      try {
        const firstLaunch = await invoke<boolean>("is_first_launch");
        setIsFirstLaunch(firstLaunch);
        // Le statut du wizard est vérifié APRÈS déverrouillage : la base
        // n'est ouverte qu'une fois le mot de passe d'accès saisi.
      } catch (error) {
        console.error("Error checking first launch:", error);
      }
    };

    checkFirstLaunch();
  }, []);

  // HMR / rechargement Vite : le state React repart à zéro mais la base Rust reste ouverte.
  useEffect(() => {
    if (isFirstLaunch !== false) return;

    void (async () => {
      try {
        const unlocked = await invoke<boolean>("is_database_unlocked");
        if (!unlocked) return;
        setIsAuthenticated(true);
        const wizardDone = await isWizardCompleted();
        setShowWizard(!wizardDone);
      } catch (error) {
        console.error("Error syncing unlock state:", error);
      }
    })();
  }, [isFirstLaunch]);

  const handlePasswordCreated = async () => {
    setIsFirstLaunch(false);
    setIsAuthenticated(true);
    // Après création du mot de passe, afficher le wizard
    setShowWizard(true);
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
  };

  const handleUnlocked = async () => {
    setIsAuthenticated(true);
    // Vérifier si le wizard est complété après déverrouillage
    try {
      const wizardDone = await isWizardCompleted();
      setShowWizard(!wizardDone);
    } catch (error) {
      console.error("Error checking wizard status:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await invoke("lock");
    } catch (error) {
      console.error("Erreur verrouillage:", error);
    }
    sessionStorage.removeItem(ETIQUETTES_RECALC_SESSION_KEY);
    etiquettesRecalcDone.current = false;
    setIsAuthenticated(false);
    setCurrentPage("dashboard");
  };

  // Étiquettes par défaut + recalcul complet une fois par session (après wizard si besoin)
  useEffect(() => {
    if (!isAuthenticated || showWizard) return;
    if (etiquettesRecalcDone.current) return;
    etiquettesRecalcDone.current = true;
    sessionStorage.setItem(ETIQUETTES_RECALC_SESSION_KEY, "1");

    void (async () => {
      try {
        await seedDefaultEtiquettes();
      } catch {
        /* déjà initialisé */
      }
      try {
        await seedDefaultEmailTemplates({ onlyIfEmpty: true });
      } catch {
        /* déjà initialisé */
      }
      try {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await runFullEtiquettesRecalc();
      } catch (error) {
        console.error("Erreur recalcul étiquettes (arrière-plan):", error);
      }
    })();
  }, [isAuthenticated, showWizard]);

  const openContact = (contactId: number, tab?: ContactDetailTabHint) => {
    requestOpenContact(contactId, {
      tab,
      currentPage,
      setCurrentPage,
    });
  };

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onOpenContact={(contactId) => openContact(contactId)}
          />
        );
      case "contacts":
        return (
          <ErrorBoundary>
            <Contacts onNavigate={setCurrentPage} />
          </ErrorBoundary>
        );
      case "familles":
        return <Familles onNavigate={setCurrentPage} />;
      case "foyers":
        return <Foyers onNavigate={setCurrentPage} />;
      case "prescripteurs":
        return <Prescripteurs onNavigate={setCurrentPage} />;
      case "partenaires":
        return <Partenaires onNavigate={setCurrentPage} />;
      case "investissements":
        return (
          <Investissements
            onOpenContact={(contactId) => openContact(contactId, "patrimoine")}
            onNavigate={setCurrentPage}
          />
        );
      case "interactions":
        return (
          <Interactions
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onOpenContact={(contactId) => openContact(contactId)}
          />
        );
      case "taches":
        return <Taches onNavigate={setCurrentPage} />;
      case "templates-email":
        return <TemplatesEmail onNavigate={setCurrentPage} />;
      case "newsletter":
        return <Newsletter onNavigate={setCurrentPage} />;
      case "suivi":
        return (
          <Suivi
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onOpenContact={(contactId) => openContact(contactId)}
          />
        );
      case "etiquettes":
        return (
          <Etiquettes
            onOpenContact={(contactId) => openContact(contactId)}
          />
        );
      case "documents":
        return (
          <Documents
            onNavigate={setCurrentPage}
            onOpenContact={(contactId) => openContact(contactId)}
          />
        );
      case "souscription-cif":
        return (
          <SouscriptionCif
            currentPage={currentPage}
            onOpenContact={(contactId) => openContact(contactId, "patrimoine")}
            onNavigate={setCurrentPage}
          />
        );
      case "parametres":
        return <Parametres />;
      default:
        return (
          <Dashboard
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onOpenContact={(contactId) => openContact(contactId)}
          />
        );
    }
  };

  // Afficher un écran de chargement pendant la vérification
  if (isFirstLaunch === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  // Premier lancement : afficher l'écran de création de mot de passe
  if (isFirstLaunch) {
    return <SetupPassword onPasswordCreated={handlePasswordCreated} />;
  }

  // Lancements suivants : afficher l'écran de déverrouillage si pas authentifié
  if (!isAuthenticated) {
    return <UnlockScreen onUnlocked={handleUnlocked} />;
  }

  // Afficher le wizard de configuration si pas encore complété
  if (showWizard) {
    return <SetupWizard onWizardComplete={handleWizardComplete} />;
  }

  // Afficher l'application avec le layout
  try {
    return (
      <>
        <AppUpdateProvider>
          <Layout
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onLogout={handleLogout}
          >
            {renderPage()}
          </Layout>
        </AppUpdateProvider>
        <Toaster richColors position="top-right" />
      </>
    );
  } catch (error) {
    console.error("Error rendering app:", error);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Erreur de chargement</h1>
          <p className="text-muted-foreground mb-4">
            Une erreur s'est produite lors du chargement de l'application.
          </p>
          <p className="text-sm text-muted-foreground font-mono">
            {String(error)}
          </p>
        </div>
      </div>
    );
  }
}

export default function App() {
  return (
    <AppBrandingProvider>
      <AppInner />
    </AppBrandingProvider>
  );
}
