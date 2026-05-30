import { ReactNode } from "react";
import { AppUpdateBanner } from "@/components/system/AppUpdateBanner";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onPageChange: (page: string) => void;
  onLogout: () => void;
}

export function Layout({ children, currentPage, onPageChange, onLogout }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar currentPage={currentPage} onPageChange={onPageChange} />
      
      <div className="flex-1 flex flex-col">
        <Header onLogout={onLogout} />
        <AppUpdateBanner />

        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
