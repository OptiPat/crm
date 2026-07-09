import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotePrintProvider } from "@/components/notes/NotePrintProvider";
import { NotesPersonalPanel } from "@/components/notes/NotesPersonalPanel";
import { NotesSharedPanel } from "@/components/notes/NotesSharedPanel";

export function Notes() {
  return (
    <NotePrintProvider>
      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Mes notes</TabsTrigger>
          <TabsTrigger value="shared">Bibliothèque partagée</TabsTrigger>
        </TabsList>
        <TabsContent value="personal" className="mt-4">
          <NotesPersonalPanel />
        </TabsContent>
        <TabsContent value="shared" className="mt-4">
          <NotesSharedPanel />
        </TabsContent>
      </Tabs>
    </NotePrintProvider>
  );
}
