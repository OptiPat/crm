import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function Interactions() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Interactions
          </h2>
          <p className="text-muted-foreground">
            Historique des échanges avec vos clients
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nouvelle interaction
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historique des interactions</CardTitle>
          <CardDescription>
            Aucune interaction enregistrée
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <div className="inline-flex p-4 bg-muted rounded-full mb-4">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Aucune interaction</h3>
            <p className="text-muted-foreground mb-4">
              Commencez à enregistrer vos échanges
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle interaction
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
