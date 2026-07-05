import { Button } from "@/components/ui/button";
import { FileUp, Plus, Search } from "lucide-react";

type MainTab = "clients" | "filleuls";
type ClientSubTab = "CLIENT" | "PROSPECT_CLIENT" | "SUSPECT_CLIENT" | "CLIENT_ANCIEN";
type FilleulSubTab =
  | "FILLEUL"
  | "PROSPECT_FILLEUL"
  | "SUSPECT_FILLEUL"
  | "FILLEUL_DESINSCRIT";

const CLIENT_LABELS: Record<ClientSubTab, string> = {
  CLIENT: "client",
  PROSPECT_CLIENT: "prospect client",
  SUSPECT_CLIENT: "suspect client",
  CLIENT_ANCIEN: "ancien client",
};

const FILLEUL_LABELS: Record<FilleulSubTab, string> = {
  FILLEUL: "filleul inscrit",
  PROSPECT_FILLEUL: "prospect filleul",
  SUSPECT_FILLEUL: "suspect filleul",
  FILLEUL_DESINSCRIT: "filleul désinscrit",
};

export function ContactsEmptyState({
  hasSearch,
  hasFilters,
  mainTab,
  subTab,
  onCreate,
  onImport,
}: {
  hasSearch: boolean;
  hasFilters: boolean;
  mainTab: MainTab;
  subTab: ClientSubTab | FilleulSubTab;
  onCreate: () => void;
  onImport: () => void;
}) {
  if (hasSearch || hasFilters) {
    return (
      <div className="py-14 text-center">
        <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-medium">Aucun résultat</p>
        <p className="text-sm text-muted-foreground mt-1">
          Modifiez la recherche ou retirez un filtre.
        </p>
      </div>
    );
  }

  const typeLabel =
    mainTab === "clients"
      ? CLIENT_LABELS[subTab as ClientSubTab]
      : FILLEUL_LABELS[subTab as FilleulSubTab];

  return (
    <div className="py-14 text-center max-w-md mx-auto">
      <p className="font-medium">Aucun {typeLabel}</p>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Créez un contact ou importez une liste pour commencer.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button className="gap-2" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Nouveau contact
        </Button>
        <Button variant="outline" className="gap-2" onClick={onImport}>
          <FileUp className="h-4 w-4" />
          Importer
        </Button>
      </div>
    </div>
  );
}
