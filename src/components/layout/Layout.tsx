import { ReactNode } from "react";
import { AppUpdateBanner } from "@/components/system/AppUpdateBanner";
import { AppNotificationsBar } from "@/components/notifications/AppNotificationsBar";
import { BackgroundActivityBanner } from "@/components/layout/BackgroundActivityBanner";
import { EtiquetteEmailSendBanner } from "@/components/etiquettes/EtiquetteEmailSendBanner";
import { useBackgroundSync } from "@/hooks/useBackgroundSync";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ContactDetailSheetProvider } from "./ContactDetailSheetProvider";

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onPageChange: (page: string) => void;
  onLogout: () => void;
}

export function Layout({ children, currentPage, onPageChange, onLogout }: LayoutProps) {
  useBackgroundSync();

  return (
    <ContactDetailSheetProvider onNavigate={onPageChange}>
      <div className="min-h-screen bg-background flex">
        <Sidebar currentPage={currentPage} onPageChange={onPageChange} />

        <div className="flex-1 flex flex-col">
          <Header
            onLogout={onLogout}
            currentPage={currentPage}
            onPageChange={onPageChange}
          />
          <AppNotificationsBar onPageChange={onPageChange} currentPage={currentPage} />
          <EtiquetteEmailSendBanner />
          <BackgroundActivityBanner />
          <AppUpdateBanner />

          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </ContactDetailSheetProvider>
  );
}
