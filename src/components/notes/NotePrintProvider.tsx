import { createContext, useContext, type ReactNode } from "react";
import { NotePrintPortal } from "@/components/notes/NotePrintPortal";
import { useNotePrintExport } from "@/hooks/use-note-print-export";
import type { NotePrintDocument } from "@/lib/notes/note-print";

type NotePrintContextValue = {
  printDocument: (document: NotePrintDocument) => Promise<void>;
  isPrinting: boolean;
};

const NotePrintContext = createContext<NotePrintContextValue | null>(null);

export function NotePrintProvider({ children }: { children: ReactNode }) {
  const { printBundle, printDocument, isPrinting } = useNotePrintExport();

  return (
    <NotePrintContext.Provider value={{ printDocument, isPrinting }}>
      {children}
      <NotePrintPortal document={printBundle} />
    </NotePrintContext.Provider>
  );
}

export function useNotePrint(): NotePrintContextValue {
  const ctx = useContext(NotePrintContext);
  if (!ctx) {
    throw new Error("useNotePrint doit être utilisé dans NotePrintProvider");
  }
  return ctx;
}
