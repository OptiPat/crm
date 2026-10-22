import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotePrintProvider } from "@/components/notes/NotePrintProvider";
import { NotesPersonalPanel } from "@/components/notes/NotesPersonalPanel";
import { NotesSharedPanel } from "@/components/notes/NotesSharedPanel";

export function Notes() {
  const [tab, setTab] = useState("personal");

  return (
    <NotePrintProvider>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="personal">Mes notes</TabsTrigger>
          <TabsTrigger value="shared">Bibliothèque partagée</TabsTrigger>
        </TabsList>
        {/* Les deux onglets restent montés : changer d'onglet ne perd pas une note en cours. */}
        <TabsContent value="personal" forceMount className="mt-4 data-[state=inactive]:hidden">
          <NotesPersonalPanel />
        </TabsContent>
        <TabsContent value="shared" forceMount className="mt-4 data-[state=inactive]:hidden">
          <NotesSharedPanel isActive={tab === "shared"} />
        </TabsContent>
      </Tabs>
    </NotePrintProvider>
  );
}
