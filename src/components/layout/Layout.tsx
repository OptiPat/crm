import { ReactNode } from "react";
import { AppUpdateBanner } from "@/components/system/AppUpdateBanner";
import { AppNotificationsBar } from "@/components/notifications/AppNotificationsBar";
import { useEmailCampaignAutoSync } from "@/hooks/useEmailCampaignAutoSync";
import { useStelliumExceltisScan } from "@/hooks/useStelliumExceltisScan";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onPageChange: (page: string) => void;
  onLogout: () => void;
}

export function Layout({ children, currentPage, onPageChange, onLogout }: LayoutProps) {
  useEmailCampaignAutoSync();
  useStelliumExceltisScan();

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar currentPage={currentPage} onPageChange={onPageChange} />
      
      <div className="flex-1 flex flex-col">
        <Header onLogout={onLogout} />
        <AppNotificationsBar onPageChange={onPageChange} currentPage={currentPage} />
        <AppUpdateBanner />

        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
