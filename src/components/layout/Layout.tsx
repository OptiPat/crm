import { ReactNode } from "react";
import { LicenseStatusBanner } from "@/components/system/LicenseStatusBanner";
import { AppUpdateBanner } from "@/components/system/AppUpdateBanner";
import { AppNotificationsBar } from "@/components/notifications/AppNotificationsBar";
import { BackgroundActivityBanner } from "@/components/layout/BackgroundActivityBanner";
import { EtiquetteEmailSendBanner } from "@/components/etiquettes/EtiquetteEmailSendBanner";
import { useBackgroundSync } from "@/hooks/useBackgroundSync";
import { useAlertesBackgroundGeneration } from "@/hooks/useAlertesBackgroundGeneration";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ContactDetailSheetProvider } from "./ContactDetailSheetProvider";

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onPageChange: (page: string) => void;
  /** Retour à la page précédente (absent s'il n'y en a pas). */
  onBack?: () => void;
  onLogout: () => void;
}

export function Layout({ children, currentPage, onPageChange, onBack, onLogout }: LayoutProps) {
  useBackgroundSync();
  useAlertesBackgroundGeneration();

  return (
    <ContactDetailSheetProvider onNavigate={onPageChange}>
      <div className="min-h-screen bg-background flex">
        <Sidebar currentPage={currentPage} onPageChange={onPageChange} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            onLogout={onLogout}
            currentPage={currentPage}
            onPageChange={onPageChange}
            onBack={onBack}
          />
          <AppNotificationsBar onPageChange={onPageChange} currentPage={currentPage} />
          <EtiquetteEmailSendBanner />
          <BackgroundActivityBanner />
          <AppUpdateBanner />
          <LicenseStatusBanner onOpenSettings={() => onPageChange("parametres")} />

          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </ContactDetailSheetProvider>
  );
}
