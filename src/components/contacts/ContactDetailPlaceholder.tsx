import { User } from "lucide-react";

export function ContactDetailPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[320px] rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 text-center">
      <User className="h-12 w-12 text-muted-foreground/40 mb-3" />
      <p className="font-medium text-foreground/90">Sélectionnez un contact</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
        Cliquez sur une ligne de la liste pour afficher la fiche à droite.
      </p>
    </div>
  );
}
