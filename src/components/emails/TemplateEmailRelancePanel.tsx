import { EmailEnvoiWeekdayPicker } from "@/components/emails/EmailEnvoiWeekdayPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";
import {
  buildRelanceTemplateNom,
  formatTemplateRelanceScheduleSummary,
} from "@/lib/emails/template-email-relance";
import type { EmailEnvoiJourCode } from "@/lib/emails/email-envoi-schedule";
import { MessageCircle, RotateCcw } from "lucide-react";

export type TemplateRelanceDraft = {
  enabled: boolean;
  useSameMessage: boolean;
  sujet: string;
  corpsHtml: string;
  /** Attendre une réponse client (bandeau + relance auto). */
  attendreReponse: boolean;
  delaiJours: number;
  envoiHeure: string;
  envoiJours: EmailEnvoiJourCode[] | null;
};

type Props = {
  draft: TemplateRelanceDraft;
  onChange: (next: TemplateRelanceDraft) => void;
  parentNom: string;
  /** Repli pour modèles sans délai explicite (constant 5 j). */
  fallbackDelaiJours?: number;
};

export function TemplateEmailRelancePanel({
  draft,
  onChange,
  parentNom,
  fallbackDelaiJours = 5,
}: Props) {
  const patch = (partial: Partial<TemplateRelanceDraft>) =>
    onChange({ ...draft, ...partial });

  const scheduleSummary = formatTemplateRelanceScheduleSummary(
    {
      delai_jours: draft.delaiJours,
      envoi_heure: draft.envoiHeure,
      envoi_jours_semaine:
        draft.envoiJours && draft.envoiJours.length > 0
          ? JSON.stringify(draft.envoiJours)
          : null,
    },
    fallbackDelaiJours
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-sky-50/80 px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-900">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Label htmlFor="suivi-attendre-reponse" className="text-sm font-medium">
              Attendre une réponse client
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Décoché pour bienvenue, newsletter métier, etc. : l&apos;envoi reste visible (fiche
              contact), mais plus dans «&nbsp;En attente de réponse&nbsp;» ni relance auto.
            </p>
          </div>
        </div>
        <Switch
          id="suivi-attendre-reponse"
          checked={draft.attendreReponse}
          onCheckedChange={(checked) => patch({ attendreReponse: checked })}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-800">
            <RotateCcw className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Label htmlFor="relance-enabled" className="text-sm font-medium">
              Relance (2ᵉ email)
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sans réponse après le délai ci-dessous → proposition dans Suivi → Envois → À relancer.
            </p>
          </div>
        </div>
        <Switch
          id="relance-enabled"
          checked={draft.enabled}
          onCheckedChange={(checked) => patch({ enabled: checked })}
        />
      </div>

      {!draft.enabled && (
        <p className="text-sm text-center text-muted-foreground py-6 border border-dashed rounded-lg">
          Relance désactivée — aucune proposition dans « À relancer » pour ce modèle.
        </p>
      )}

      {draft.enabled && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2 border-b pb-4">
            <Label className="text-sm font-medium">Quand proposer la relance ?</Label>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label htmlFor="rel-delai" className="text-xs text-muted-foreground">
                  Délai (jours après le 1er envoi)
                </Label>
                <Input
                  id="rel-delai"
                  type="number"
                  min={0}
                  max={365}
                  className="w-24"
                  value={draft.delaiJours}
                  onChange={(e) =>
                    patch({ delaiJours: Math.max(0, parseInt(e.target.value, 10) || 0) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rel-heure" className="text-xs text-muted-foreground">
                  Heure
                </Label>
                <Input
                  id="rel-heure"
                  type="time"
                  className="w-[160px]"
                  value={draft.envoiHeure}
                  onChange={(e) => patch({ envoiHeure: e.target.value })}
                />
              </div>
            </div>
            <EmailEnvoiWeekdayPicker
              id="rel-jours-semaine"
              value={draft.envoiJours}
              onChange={(days) => patch({ envoiJours: days })}
            />
            <p className="text-xs text-muted-foreground">
              En résumé : <strong>{scheduleSummary}</strong> → onglet À relancer (validation manuelle).
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="relance-same"
              checked={draft.useSameMessage}
              onCheckedChange={(c) => patch({ useSameMessage: !!c })}
            />
            <div className="space-y-0.5">
              <Label htmlFor="relance-same" className="text-sm font-normal cursor-pointer">
                Renvoyer le même message que le premier envoi
              </Label>
              <p className="text-xs text-muted-foreground">
                Sinon, rédigez un 2ᵉ message dédié (enregistré comme modèle « Relance — … »).
              </p>
            </div>
          </div>

          {!draft.useSameMessage && (
            <div className="space-y-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Modèle lié :{" "}
                <strong>
                  {parentNom.trim()
                    ? buildRelanceTemplateNom(parentNom)
                    : "Relance — (nom du modèle principal)"}
                </strong>
              </p>
              <div className="space-y-2">
                <Label htmlFor="relance-sujet">Objet du 2ᵉ email *</Label>
                <Input
                  id="relance-sujet"
                  value={draft.sujet}
                  onChange={(e) => patch({ sujet: e.target.value })}
                  placeholder="Ex. Suite à mon message…"
                />
              </div>
              <div className="space-y-2">
                <Label>Message de relance *</Label>
                <RichTextEmailEditor
                  value={draft.corpsHtml}
                  onChange={(html) => patch({ corpsHtml: html })}
                  minHeight="160px"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
