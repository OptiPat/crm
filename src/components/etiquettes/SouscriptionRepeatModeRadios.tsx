import { Label } from "@/components/ui/label";

export type SouscriptionRepeatVariant = "etiquette" | "email";

type Props = {
  eachInvestissement: boolean;
  onChange: (each: boolean) => void;
  /** `etiquette` = pose de l'étiquette ; `email` = file Suivi → Envois (modèle). */
  variant: SouscriptionRepeatVariant;
  /** Nom du groupe radio (obligatoire si plusieurs blocs sur la même page). */
  name: string;
};

const COPY: Record<
  SouscriptionRepeatVariant,
  { title: string; eachTitle: string; eachDetail: string; onceTitle: string; onceDetail: string }
> = {
  etiquette: {
    title: "Si le client souscrit plusieurs fois",
    eachTitle: "À chaque investissement",
    eachDetail:
      "L'étiquette est reposée à chaque nouvelle souscription (filtres, compteurs Suivi).",
    onceTitle: "Une seule fois par contact",
    onceDetail: "L'étiquette auto n'est posée qu'à la première souscription.",
  },
  email: {
    title: "Si le client souscrit plusieurs fois",
    eachTitle: "À chaque investissement",
    eachDetail:
      "Un mail proposé dans Suivi → Envois à chaque nouvelle souscription (ex. 2ᵉ contrat = 2ᵉ mail).",
    onceTitle: "Une seule fois par contact",
    onceDetail: "Seulement la première souscription déclenche ce modèle.",
  },
};

export function SouscriptionRepeatModeRadios({
  eachInvestissement,
  onChange,
  variant,
  name,
}: Props) {
  const copy = COPY[variant];

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <Label className="text-xs font-medium">{copy.title}</Label>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          name={name}
          className="mt-1"
          checked={eachInvestissement}
          onChange={() => onChange(true)}
        />
        <span className="text-sm">
          <strong>{copy.eachTitle}</strong> — {copy.eachDetail}
        </span>
      </label>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          name={name}
          className="mt-1"
          checked={!eachInvestissement}
          onChange={() => onChange(false)}
        />
        <span className="text-sm">
          <strong>{copy.onceTitle}</strong> — {copy.onceDetail}
        </span>
      </label>
    </div>
  );
}
