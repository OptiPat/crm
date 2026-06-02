import { Info } from "lucide-react";

/** Aide contextuelle : étiquette vs déclencheur modèle. */
export function EtiquetteSouscriptionGuide() {
  return (
    <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50/80 dark:bg-blue-950/30 dark:border-blue-900 px-3 py-2.5 text-xs text-blue-950 dark:text-blue-100">
      <Info className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p>
          <strong>Cette règle pose une étiquette</strong> sur le contact (filtres, onglet Contacts
          étiquetés). Ce n&apos;est pas la même chose que l&apos;email automatique du modèle.
        </p>
        <p>
          Pour un mail <strong>sans étiquette</strong> (ex. bienvenue J+3) :{" "}
          <strong>Templates email</strong> → votre modèle → onglet <strong>Déclencheur</strong>{" "}
          « Nouvelle souscription ». Vous évitez une étiquette par campagne.
        </p>
      </div>
    </div>
  );
}
