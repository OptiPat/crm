import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CategoryTogglePills } from "@/components/etiquettes/etiquette-form-ui";
import { TemplateEmailEphemeralProductFilter } from "@/components/emails/TemplateEmailEphemeralProductFilter";
import {
  EPHEMERAL_DEFAULT_SEND_TIME,
  ephemeralSendDateTimeToUnix,
  unixToEphemeralSendDateLocal,
  unixToEphemeralSendTimeLocal,
  type EphemeralCampaignAudience,
  type EphemeralReinvestFilter,
  type EphemeralVersementProgrammeFilter,
} from "@/lib/emails/template-email-ephemeral";

const CONTACT_CATEGORIES = [
  { value: "CLIENT", label: "Client" },
  { value: "PROSPECT_CLIENT", label: "Prospect client" },
  { value: "PROSPECT_FILLEUL", label: "Prospect filleul" },
  { value: "SUSPECT_CLIENT", label: "Suspect client" },
  { value: "SUSPECT_FILLEUL", label: "Suspect filleul" },
] as const;

type Props = {
  audience: EphemeralCampaignAudience;
  sendAt: number | null;
  onAudienceChange: (next: EphemeralCampaignAudience) => void;
  onSendAtChange: (next: number | null) => void;
  highlightInvalid?: boolean;
};

export function TemplateEmailEphemeralAudiencePanel({
  audience,
  sendAt,
  onAudienceChange,
  onSendAtChange,
  highlightInvalid,
}: Props) {
  const patchAudience = (partial: Partial<EphemeralCampaignAudience>) =>
    onAudienceChange({ ...audience, ...partial });

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-violet-50/40 px-4 py-3 text-sm text-muted-foreground">
        Campagne ponctuelle : ciblez des contacts par produits, préparez la file, puis envoyez depuis{" "}
        <strong className="text-foreground">Suivi → Envois</strong>. Le modèle disparaît de la
        bibliothèque une fois la campagne terminée ; l&apos;historique reste sur chaque fiche.
      </div>

      <div className="space-y-2">
        <Label>Catégories contact</Label>
        <CategoryTogglePills
          categories={CONTACT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          selected={audience.categories}
          onToggle={(value) => {
            const next = audience.categories.includes(value)
              ? audience.categories.filter((c) => c !== value)
              : [...audience.categories, value];
            patchAudience({ categories: next.length > 0 ? next : ["CLIENT"] });
          }}
        />
      </div>

      <TemplateEmailEphemeralProductFilter
        types={audience.types_produit}
        nomsProduit={audience.noms_produit}
        produitsMatchMode={audience.produits_match_mode}
        onTypesChange={(types) => patchAudience({ types_produit: types })}
        onNomsProduitChange={(noms) => patchAudience({ noms_produit: noms })}
        onProduitsMatchModeChange={(produits_match_mode) => patchAudience({ produits_match_mode })}
        highlightInvalid={highlightInvalid}
      />

      <div className="space-y-3 rounded-lg border px-4 py-3">
        <p className="text-xs font-medium text-foreground">
          Options sur les investissements ciblés
        </p>
        <p className="text-xs text-muted-foreground -mt-1">
          Filtres appliqués aux produits correspondant ci-dessus (SCPI, OPCVM, assurance-vie…),
          selon les cases renseignées sur chaque fiche investissement.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Réinvestissement des dividendes</Label>
            <Select
              value={audience.reinvestissement_dividendes}
              onValueChange={(v) =>
                patchAudience({ reinvestissement_dividendes: v as EphemeralReinvestFilter })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Sans filtre</SelectItem>
                <SelectItem value="inactive">
                  Au moins un produit ciblé sans réinvestissement
                </SelectItem>
                <SelectItem value="active">
                  Au moins un produit ciblé avec réinvestissement actif
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Versements programmés</Label>
            <Select
              value={audience.versement_programme}
              onValueChange={(v) =>
                patchAudience({ versement_programme: v as EphemeralVersementProgrammeFilter })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Sans filtre</SelectItem>
                <SelectItem value="inactive">
                  Au moins un produit ciblé sans versement programmé
                </SelectItem>
                <SelectItem value="active">
                  Au moins un produit ciblé avec versement programmé actif
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Envoi planifié (optionnel)</Label>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label htmlFor="ephemeral-send-date" className="text-xs text-muted-foreground">
              Date
            </Label>
            <Input
              id="ephemeral-send-date"
              type="date"
              className="w-[180px]"
              value={unixToEphemeralSendDateLocal(sendAt)}
              onChange={(e) => {
                const date = e.target.value;
                if (!date) {
                  onSendAtChange(null);
                  return;
                }
                onSendAtChange(
                  ephemeralSendDateTimeToUnix(
                    date,
                    sendAt != null
                      ? unixToEphemeralSendTimeLocal(sendAt)
                      : EPHEMERAL_DEFAULT_SEND_TIME
                  )
                );
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ephemeral-send-time" className="text-xs text-muted-foreground">
              Heure
            </Label>
            <Input
              id="ephemeral-send-time"
              type="time"
              className="w-[140px]"
              value={unixToEphemeralSendTimeLocal(sendAt)}
              disabled={sendAt == null}
              onChange={(e) => {
                const date = unixToEphemeralSendDateLocal(sendAt);
                if (!date) return;
                onSendAtChange(ephemeralSendDateTimeToUnix(date, e.target.value));
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Sans date : file dès la préparation (Prêts à envoyer). Avec date et heure : visible dans
          Suivi → Envois à partir du créneau choisi.
        </p>
      </div>
    </div>
  );
}
