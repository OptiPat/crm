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
        <TabsContent value="personal" className="mt-4">
          <NotesPersonalPanel />
        </TabsContent>
        <TabsContent value="shared" className="mt-4">
          <NotesSharedPanel isActive={tab === "shared"} />
        </TabsContent>
      </Tabs>
    </NotePrintProvider>
  );
}
