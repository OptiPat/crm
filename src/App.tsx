import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Toaster } from "sonner";
import { LicenseActivation } from "@/pages/LicenseActivation";
import { SetupPassword } from "@/pages/SetupPassword";
import { SetupWizard } from "@/pages/SetupWizard";
import { UnlockScreen } from "@/pages/UnlockScreen";
import { Layout } from "@/components/layout/Layout";
import { TeamWorkspaceStatusBanner } from "@/components/team/TeamWorkspaceStatusBanner";
import { Dashboard } from "@/pages/Dashboard";
import { Statistiques } from "@/pages/Statistiques";
import { Contacts } from "@/pages/Contacts";
import { Familles } from "@/pages/Familles";
import { Foyers } from "@/pages/Foyers";
import { Prescripteurs } from "@/pages/Prescripteurs";
import { Partenaires } from "@/pages/Partenaires";
import { Organisation } from "@/pages/Organisation";
import { Investissements } from "@/pages/Investissements";
import { VeilleFonds } from "@/pages/VeilleFonds";
import { Documents } from "@/pages/Documents";
import { SouscriptionCif } from "@/pages/SouscriptionCif";
import { Interactions } from "@/pages/Interactions";
import { Taches } from "@/pages/Taches";
import { Parametres } from "@/pages/Parametres";
import { Comptabilite } from "@/pages/Comptabilite";
import { Notes } from "@/pages/Notes";
import { TemplatesEmail } from "@/pages/TemplatesEmail";
import { Suivi } from "@/pages/Suivi";
import { Etiquettes } from "@/pages/Etiquettes";
import { Pipe } from "@/pages/Pipe";
import { PipeParrainage } from "@/pages/PipeParrainage";
import { Agenda } from "@/pages/Agenda";
import { Newsletter } from "@/pages/Newsletter";
import { AppBrandingProvider } from "@/components/app-branding/AppBrandingProvider";
import { EspaceClientProvider } from "@/components/espace-client/EspaceClientProvider";
import { TeamWorkspaceProvider } from "@/components/team/TeamWorkspaceProvider";
import { PageErrorBoundary } from "@/components/layout/PageErrorBoundary";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { hasUnsavedPageChanges } from "@/lib/navigation/page-leave-guard";
import { clearPendingNavigationIntents } from "@/lib/navigation/app-navigation";
import { AppUpdateProvider } from "@/components/system/app-update-context";
import { isWizardCompleted } from "@/lib/api/tauri-settings";
import { seedDefaultEtiquettes } from "@/lib/api/tauri-etiquettes";
import { seedDefaultEmailTemplates } from "@/lib/api/tauri-templates-email";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";
import { needsLicenseActivation } from "@/lib/api/tauri-license";
import { LICENSE_UI_VISIBLE } from "@/lib/licensing/license-ui";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import { runBackgroundAutomationAfterUnlock, waitForBackgroundAutomationCycleIdle } from "@/lib/background/background-automation-runner";
import { useBackgroundAutomationListener } from "@/hooks/useBackgroundAutomationListener";
import { useAutomationNotificationListener } from "@/hooks/useAutomationNotificationListener";
import { useOneDriveBackgroundListener } from "@/hooks/useOneDriveBackgroundListener";
import { useAutoLock } from "@/hooks/useAutoLock";
import type { UiSessionLockedPayload } from "@/lib/api/tauri-auth";
import { useFundWatchlistCoachGlobalListener } from "@/hooks/useFundWatchlistCoachGlobalListener";
import { loadCoachGenerating } from "@/lib/fund-watchlist/fund-watchlist-coach-store";

const ETIQUETTES_RECALC_SESSION_KEY = "crm_etiquettes_recalc_done";
const PAGE_HISTORY_MAX = 30;
/** Durée par défaut des messages (les erreurs restent 10 s : voir main.tsx). */
const TOAST_DURATION_MS = 6000;

type PageNavState = { page: string; history: string[] };
type PendingNavigation = { page: string; back: boolean };

/** Une fenêtre (dialogue, panneau) est ouverte : on ne change pas de page dessous au clavier/souris. */
function isModalOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') != null;
}

/** Saisie en cours : Alt+← y garde son sens (mot précédent, etc.). */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') != null;
}

function AppInner() {
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isEngineAvailable, setIsEngineAvailable] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [nav, setNav] = useState<PageNavState>({ page: "dashboard", history: [] });
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const navRef = useRef(nav);
  const currentPage = nav.page;
  const [unlockNotice, setUnlockNotice] = useState("");
  const [unlockReason, setUnlockReason] = useState("");
  const etiquettesRecalcDone = useRef(
    sessionStorage.getItem(ETIQUETTES_RECALC_SESSION_KEY) === "1"
  );
  const etiquettesRecalcInFlight = useRef(false);

  const handleSessionLocked = useCallback((payload?: UiSessionLockedPayload) => {
    // La page courante est gardée : on y revient après déverrouillage (la base, elle, est refermée).
    setIsAuthenticated(false);
    // Navigation en attente de confirmation : son intention ne doit pas ressurgir au retour.
    setPendingNavigation((prev) => {
      if (prev) clearPendingNavigationIntents();
      return null;
    });
    setLockConfirmOpen(false);
    setUnlockNotice((prev) => payload?.message || prev);
    setUnlockReason(payload?.reason || "");
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await invoke("lock");
    } catch (error) {
      console.error("Erreur verrouillage:", error);
      return;
    }
    handleSessionLocked();
  }, [handleSessionLocked]);

  /** Bouton « Verrouiller » : confirmation si saisie non enregistrée (pas le verrouillage auto). */
  const requestLock = useCallback(() => {
    if (hasUnsavedPageChanges()) {
      setLockConfirmOpen(true);
      return;
    }
    void handleLogout();
  }, [handleLogout]);

  useEffect(() => {
    navRef.current = nav;
  }, [nav]);

  const commitNavigation = useCallback((page: string, back: boolean) => {
    setNav((prev) => {
      if (prev.page === page) return prev;
      const history = back
        ? prev.history.slice(0, -1)
        : [...prev.history, prev.page].slice(-PAGE_HISTORY_MAX);
      return { page, history };
    });
  }, []);

  /** Point d'entrée unique de tout changement de page (menu, recherche, liens, notifications). */
  const navigateTo = useCallback(
    (page: string) => {
      if (page === navRef.current.page) return;
      if (hasUnsavedPageChanges()) {
        setPendingNavigation({ page, back: false });
        return;
      }
      commitNavigation(page, false);
    },
    [commitNavigation]
  );

  const goBack = useCallback(() => {
    const { history } = navRef.current;
    const previous = history[history.length - 1];
    if (!previous) return;
    if (hasUnsavedPageChanges()) {
      setPendingNavigation({ page: previous, back: true });
      return;
    }
    commitNavigation(previous, true);
  }, [commitNavigation]);

  const navigationConfirmedRef = useRef(false);

  const confirmPendingNavigation = () => {
    navigationConfirmedRef.current = true;
    if (pendingNavigation) commitNavigation(pendingNavigation.page, pendingNavigation.back);
    setPendingNavigation(null);
  };

  /** Fermeture de la confirmation : sans « Quitter », l'intention déjà enregistrée est oubliée. */
  const closePendingNavigation = () => {
    if (!navigationConfirmedRef.current) clearPendingNavigationIntents();
    navigationConfirmedRef.current = false;
    setPendingNavigation(null);
  };

  useAppNavigationListener((detail) => {
    if (detail.type === "page") navigateTo(detail.page);
  });

  const navigateVeilleFonds = useCallback(() => {
    navigateTo("veille-fonds");
  }, [navigateTo]);

  // Retour : Alt+← et bouton « précédent » de la souris.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowLeft" && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        if (e.defaultPrevented || isEditableTarget(e.target) || isModalOpen()) return;
        e.preventDefault();
        goBack();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 3) return;
      e.preventDefault();
      if (!isModalOpen()) goBack();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isAuthenticated, goBack]);

  useBackgroundAutomationListener(isEngineAvailable);
  useOneDriveBackgroundListener(isEngineAvailable);
  useAutomationNotificationListener(isAuthenticated, navigateTo);
  useAutoLock(isAuthenticated, handleLogout, handleSessionLocked);
  useFundWatchlistCoachGlobalListener(
    isEngineAvailable && (isAuthenticated || loadCoachGenerating()),
    navigateVeilleFonds
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
        const databaseUnlocked = await invoke<boolean>("is_database_unlocked");
        setIsEngineAvailable(databaseUnlocked);
        if (!databaseUnlocked) return;
        const sessionUnlocked = await invoke<boolean>("is_ui_session_unlocked");
        if (!sessionUnlocked) return;
        setIsAuthenticated(true);
        void runBackgroundAutomationAfterUnlock();
        const needsLicense = LICENSE_UI_VISIBLE && (await needsLicenseActivation());
        if (needsLicense) {
          setShowLicense(true);
          setShowWizard(false);
          return;
        }
        setShowLicense(false);
        const wizardDone = await isWizardCompleted();
        setShowWizard(!wizardDone);
      } catch (error) {
        console.error("Error syncing unlock state:", error);
      }
    })();
  }, [isFirstLaunch]);

  const syncPostUnlockState = async () => {
    const needsLicense = LICENSE_UI_VISIBLE && (await needsLicenseActivation());
    if (needsLicense) {
      setShowLicense(true);
      setShowWizard(false);
      return;
    }
    setShowLicense(false);
    const wizardDone = await isWizardCompleted();
    setShowWizard(!wizardDone);
  };

  const handlePasswordCreated = async () => {
    setIsFirstLaunch(false);
    setIsEngineAvailable(true);
    setIsAuthenticated(true);
    await syncPostUnlockState();
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
  };

  const handleLicenseComplete = async () => {
    setShowLicense(false);
    try {
      const wizardDone = await isWizardCompleted();
      setShowWizard(!wizardDone);
    } catch (error) {
      console.error("Error checking wizard status:", error);
      setShowWizard(true);
    }
  };

  const handleUnlocked = async () => {
    setUnlockNotice("");
    setUnlockReason("");
    setIsEngineAvailable(true);
    setIsAuthenticated(true);
    try {
      await syncPostUnlockState();
    } catch (error) {
      console.error("Error checking wizard status:", error);
    }
    void runBackgroundAutomationAfterUnlock();
  };

  // Étiquettes par défaut + recalcul complet une fois par session (après wizard si besoin)
  useEffect(() => {
    if (!isAuthenticated || showWizard || showLicense) return;
    if (etiquettesRecalcDone.current) return;
    if (etiquettesRecalcInFlight.current) return;
    let cancelled = false;
    let retryTimer: number | null = null;

    const scheduleRetry = () => {
      if (cancelled) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void runRecalc();
      }, 60_000);
    };

    const runRecalc = async () => {
      if (cancelled || etiquettesRecalcDone.current || etiquettesRecalcInFlight.current) {
        return;
      }
      etiquettesRecalcInFlight.current = true;
      try {
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
        const idle = await waitForBackgroundAutomationCycleIdle(600_000);
        if (!idle) {
          console.warn("Recalcul étiquettes reporté : automatisation encore en cours");
          scheduleRetry();
          return;
        }
        await runFullEtiquettesRecalc();
        if (!cancelled) {
          etiquettesRecalcDone.current = true;
          sessionStorage.setItem(ETIQUETTES_RECALC_SESSION_KEY, "1");
        }
      } catch (error) {
        console.error("Erreur recalcul étiquettes (arrière-plan):", error);
        scheduleRetry();
      } finally {
        etiquettesRecalcInFlight.current = false;
      }
    };

    void runRecalc();
    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
    };
  }, [isAuthenticated, showWizard, showLicense]);

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard
            currentPage={currentPage}
            onNavigate={navigateTo}
          />
        );
      case "statistiques":
        return <Statistiques onNavigate={navigateTo} />;
      case "pipe":
        return <Pipe />;
      case "pipe-parrainage":
        return <PipeParrainage />;
      case "contacts":
        return <Contacts onNavigate={navigateTo} />;
      case "familles":
        return <Familles onNavigate={navigateTo} />;
      case "foyers":
        return <Foyers onNavigate={navigateTo} />;
      case "prescripteurs":
        return <Prescripteurs onNavigate={navigateTo} />;
      case "partenaires":
        return <Partenaires onNavigate={navigateTo} />;
      case "organisation":
        return <Organisation onNavigate={navigateTo} />;
      case "investissements":
        return <Investissements onNavigate={navigateTo} />;
      case "veille-fonds":
        return <VeilleFonds onNavigate={navigateTo} />;
      case "interactions":
        return (
          <Interactions
            currentPage={currentPage}
            onNavigate={navigateTo}
          />
        );
      case "taches":
        return <Taches onNavigate={navigateTo} />;
      case "agenda":
        return <Agenda onNavigate={navigateTo} />;
      case "templates-email":
        return <TemplatesEmail onNavigate={navigateTo} currentPage={currentPage} />;
      case "newsletter":
        return <Newsletter onNavigate={navigateTo} />;
      case "suivi":
        return (
          <Suivi
            currentPage={currentPage}
            onNavigate={navigateTo}
          />
        );
      case "etiquettes":
        return <Etiquettes onNavigate={navigateTo} />;
      case "documents":
        return <Documents onNavigate={navigateTo} />;
      case "souscription-cif":
        return (
          <SouscriptionCif
            currentPage={currentPage}
            onNavigate={navigateTo}
          />
        );
      case "notes":
        return <Notes />;
      case "comptabilite":
        return <Comptabilite />;
      case "parametres":
        return (
          <Parametres
            currentPage={currentPage}
            onNavigate={navigateTo}
          />
        );
      default:
        return (
          <Dashboard
            currentPage={currentPage}
            onNavigate={navigateTo}
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
    return <UnlockScreen onUnlocked={handleUnlocked} initialNotice={unlockNotice} initialReason={unlockReason} />;
  }

  // Afficher l'écran d'activation licence si nécessaire (masqué tant que LICENSE_UI_VISIBLE est false)
  if (LICENSE_UI_VISIBLE && showLicense) {
    return <LicenseActivation onComplete={() => void handleLicenseComplete()} />;
  }

  // Afficher le wizard de configuration si pas encore complété
  if (showWizard) {
    return <SetupWizard onWizardComplete={handleWizardComplete} />;
  }

  // Afficher l'application avec le layout
  return (
    <EspaceClientProvider enabled={isEngineAvailable}>
      <TeamWorkspaceProvider enabled={isEngineAvailable}>
        <AppUpdateProvider>
          <Layout
            currentPage={currentPage}
            onPageChange={navigateTo}
            onBack={nav.history.length > 0 ? goBack : undefined}
            onLogout={requestLock}
          >
            <TeamWorkspaceStatusBanner onOpenSettings={() => navigateTo("parametres")} />
            <PageErrorBoundary
              key={currentPage}
              onGoHome={currentPage === "dashboard" ? undefined : () => navigateTo("dashboard")}
            >
              {renderPage()}
            </PageErrorBoundary>
          </Layout>
        </AppUpdateProvider>
        <AlertDialog
          open={pendingNavigation != null}
          onOpenChange={(open) => {
            if (!open) closePendingNavigation();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Quitter cette page ?</AlertDialogTitle>
              <AlertDialogDescription>
                Vos modifications ne sont pas enregistrées. Si vous quittez, elles seront perdues.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continuer l&apos;édition</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={confirmPendingNavigation}>
                Quitter sans enregistrer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={lockConfirmOpen} onOpenChange={setLockConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Verrouiller sans enregistrer ?</AlertDialogTitle>
              <AlertDialogDescription>Vos modifications seront perdues.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continuer l&apos;édition</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setLockConfirmOpen(false);
                  void handleLogout();
                }}
              >
                Verrouiller sans enregistrer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Toaster
          richColors
          closeButton
          position="top-right"
          offset={{ top: 96, right: 24 }}
          visibleToasts={4}
          expand
          toastOptions={{ duration: TOAST_DURATION_MS, closeButtonAriaLabel: "Fermer" }}
        />
      </TeamWorkspaceProvider>
    </EspaceClientProvider>
  );
}

export default function App() {
  return (
    <PageErrorBoundary variant="app">
      <AppBrandingProvider>
        <AppInner />
      </AppBrandingProvider>
    </PageErrorBoundary>
  );
}
