import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EnvoisQueueStats({
  ready,
  scheduled,
  incomplete,
  cancelled,
  sent,
  followup,
  active,
  onSelect,
}: {
  ready: number;
  scheduled: number;
  incomplete: number;
  cancelled: number;
  sent: number;
  followup: number;
  active:
    | "ready"
    | "scheduled"
    | "incomplete"
    | "cancelled"
    | "sent"
    | "followup"
    | "journal";
  onSelect: (
    tab: "ready" | "scheduled" | "incomplete" | "cancelled" | "sent" | "followup" | "journal"
  ) => void;
}) {
  const items: {
    id: typeof active;
    label: string;
    count: number;
    accent?: boolean;
  }[] = [
    { id: "ready", label: "Prêts", count: ready, accent: ready > 0 },
    { id: "scheduled", label: "Planifiés", count: scheduled },
    { id: "incomplete", label: "À compléter", count: incomplete, accent: incomplete > 0 },
    { id: "cancelled", label: "Retirés", count: cancelled, accent: cancelled > 0 },
    { id: "sent", label: "Envoyés", count: sent },
    { id: "followup", label: "À relancer", count: followup, accent: followup > 0 },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={cn(
            "rounded-xl border px-3 py-2.5 text-left transition-all",
            active === item.id
              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
              : "border-border bg-card hover:border-primary/30",
            item.accent && active !== item.id && "border-amber-200/80"
          )}
        >
          <p className="text-2xl font-semibold tabular-nums leading-none">{item.count}</p>
          <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
        </button>
      ))}
    </div>
  );
}

export function EnvoisQueueHelp() {
  return (
    <details className="group rounded-lg border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <Mail className="h-4 w-4 text-primary shrink-0" />
        Comment fonctionne la file d&apos;envoi ?
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-muted-foreground text-xs leading-relaxed border-t border-border/60 pt-3">
        <p>
          <strong className="text-foreground">1. Paramétrer</strong> — Sur chaque étiquette (onglet
          Email) : modèle + planification. Recalculer les étiquettes si la règle auto a changé.
        </p>
        <p>
          <strong className="text-foreground">2. Prêts à envoyer</strong> — Le CRM prépare les
          emails ; vous confirmez un par un ou en <strong>sélection groupée</strong> (cases à
          cocher). CRM ouvert, boîte connectée dans Paramètres → Email. ✕ sur Prêts ou sur
          À compléter → onglet <strong>Retirés</strong> (<strong>Remettre en file</strong> pour
          annuler) ; ✕ sur Retirés → ne plus proposer (hors file, étiquette conservée).
        </p>
        <p>
          <strong className="text-foreground">Journal</strong> — Chaque envoi (individuel, groupé,
          étiquette ou modèle seul) est tracé avec horodatage et statut. Les{" "}
          <strong>bulletins SCPI trimestriels</strong> n&apos;apparaissent pas dans Envoyés / À
          relancer : consultez le <strong>Journal</strong> (filtre SCPI disponible).
        </p>
        <p>
          <strong className="text-foreground">Campagnes email</strong> — En haut de l&apos;onglet :{" "}
          <strong>bulletins SCPI</strong> (PDF → n8n → prepare) et{" "}
          <strong>Perf Stellium AV/PER</strong> (import encours → prepare). Contrôlez l&apos;aperçu
          avant envoi groupé. Modèle Stellium : Modèles email.
        </p>
        <p>
          <strong className="text-foreground">Planifiés</strong> — Date d&apos;envoi pas encore
          atteinte : rien à faire, passage automatique dans Prêts à la date prévue.
        </p>
        <p>
          <strong className="text-foreground">À compléter</strong> — Vrais blocages uniquement
          (email manquant, modèle ou date sur l&apos;étiquette). ✕ pour retirer vers Retirés.
        </p>
        <p>
          <strong className="text-foreground">3. Suivi</strong> — « En attente de réponse » seulement
          si le modèle a <strong>Attendre une réponse client</strong> coché (onglet Relance du
          modèle). Bienvenue / reco : décocher → envoi visible sur la fiche, pas dans ce suivi.
        </p>
      </div>
    </details>
  );
}

/** Barre campagne SCPI dans l’onglet Prêts — filtre liste vs sélection cases. */
export function ScpiReadyCampaignBar({
  periode,
  batchCount,
  otherReadyCount,
  filtered,
  onToggleFilter,
  onSelectBatch,
}: {
  periode: string;
  batchCount: number;
  otherReadyCount: number;
  filtered: boolean;
  onToggleFilter: () => void;
  onSelectBatch: () => void;
}) {
  const batchLabel =
    batchCount === 1
      ? "1 mail bulletin SCPI prêt pour ce trimestre."
      : `${batchCount} mails bulletins SCPI prêts pour ce trimestre.`;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2.5 space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">
          Campagne bulletins SCPI — {periode}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {batchLabel}
          {!filtered && otherReadyCount > 0
            ? ` ${otherReadyCount} autre${otherReadyCount > 1 ? "s" : ""} envoi${otherReadyCount > 1 ? "s" : ""} prêt${otherReadyCount > 1 ? "s" : ""} (hors SCPI) dans la liste.`
            : filtered
              ? " Seuls les mails de cette campagne sont affichés."
              : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {otherReadyCount > 0 && (
          <Button type="button" variant={filtered ? "secondary" : "outline"} size="sm" onClick={onToggleFilter}>
            {filtered ? "Afficher tous les envois prêts" : `Masquer les envois hors SCPI`}
          </Button>
        )}
        <Button
          type="button"
          variant="default"
          size="sm"
          title="Coche la campagne et ouvre l’envoi groupé"
          onClick={onSelectBatch}
        >
          {batchCount === 1
            ? "Envoyer la campagne (1 mail)"
            : `Envoyer la campagne (${batchCount} mails)`}
        </Button>
      </div>
    </div>
  );
}

export function EnvoisEmailConnectionBanner({
  connected,
  provider,
  email,
}: {
  connected: boolean;
  provider?: string | null;
  email?: string | null;
}) {
  if (!connected) {
    return (
      <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Connectez votre boîte dans <strong>Paramètres → Email</strong> pour envoyer depuis cette
          file.
        </span>
      </p>
    );
  }

  return (
    <p className="text-xs text-green-900 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
      Boîte connectée ({provider === "google" ? "Google" : "Microsoft"}
      {email ? ` — ${email}` : ""})
    </p>
  );
}
