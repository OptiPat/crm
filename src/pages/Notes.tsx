import { StickyNote } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesPersonalPanel } from "@/components/notes/NotesPersonalPanel";
import { NotesSharedPanel } from "@/components/notes/NotesSharedPanel";

export function Notes() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="inline-flex p-2 rounded-lg bg-primary/10">
          <StickyNote className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">Notes</h1>
          <p className="text-sm text-muted-foreground">
            Procédures personnelles et bibliothèque partagée entre installations CRM.
          </p>
        </div>
      </div>

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
    </div>
  );
}
