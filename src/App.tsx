import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SetupPassword } from "@/pages/SetupPassword";
import { UnlockScreen } from "@/pages/UnlockScreen";
import { Layout } from "@/components/layout/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Contacts } from "@/pages/Contacts";
import { Familles } from "@/pages/Familles";
import { Prescripteurs } from "@/pages/Prescripteurs";
import { Partenaires } from "@/pages/Partenaires";
import { Investissements } from "@/pages/Investissements";
import { Documents } from "@/pages/Documents";
import { Interactions } from "@/pages/Interactions";
import { Parametres } from "@/pages/Parametres";
import { TemplatesEmail } from "@/pages/TemplatesEmail";
import { Suivi } from "@/pages/Suivi";
import { ErrorBoundary } from "@/components/contacts/ErrorBoundary";

function App() {
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState("dashboard");

  useEffect(() => {
    // Vérifier si c'est le premier lancement
    const checkFirstLaunch = async () => {
      try {
        const firstLaunch = await invoke<boolean>("is_first_launch");
        setIsFirstLaunch(firstLaunch);
      } catch (error) {
        console.error("Error checking first launch:", error);
      }
    };
    
    checkFirstLaunch();
  }, []);

  const handlePasswordCreated = () => {
    setIsFirstLaunch(false);
    setIsAuthenticated(true);
  };

  const handleUnlocked = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentPage("dashboard");
  };

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard />;
      case "contacts":
        return (
          <ErrorBoundary>
            <Contacts />
          </ErrorBoundary>
        );
      case "familles":
        return <Familles />;
      case "prescripteurs":
        return <Prescripteurs />;
      case "partenaires":
        return <Partenaires />;
      case "investissements":
        return <Investissements />;
      case "documents":
        return <Documents />;
      case "interactions":
        return <Interactions />;
      case "templates-email":
        return <TemplatesEmail />;
      case "suivi":
        return <Suivi />;
      case "parametres":
        return <Parametres />;
      default:
        return <Dashboard />;
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

  // Afficher l'application avec le layout
  try {
    return (
      <Layout
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onLogout={handleLogout}
      >
        {renderPage()}
      </Layout>
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

export default App;
