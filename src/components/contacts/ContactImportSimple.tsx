import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ContactImportSimpleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ContactImportSimple({ open, onOpenChange, onSuccess: _onSuccess }: ContactImportSimpleProps) {
  const [message, setMessage] = useState("Composant chargé !");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Test Import - Version Simple</DialogTitle>
          <DialogDescription>
            Si vous voyez ceci, le composant de base fonctionne
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-4">
          <div className="bg-green-100 border border-green-300 rounded p-4">
            <p className="text-green-800 font-medium">{message}</p>
          </div>

          <Button onClick={() => setMessage("Bouton cliqué !")}>
            Tester le bouton
          </Button>

          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
