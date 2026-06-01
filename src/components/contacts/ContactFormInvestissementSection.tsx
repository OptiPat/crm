export type InvestissementFormChoice = { addAfterCreate: false } | { addAfterCreate: true };

interface ContactFormInvestissementSectionProps {
  value: InvestissementFormChoice;
  onChange: (value: InvestissementFormChoice) => void;
}

export function ContactFormInvestissementSection({
  value,
  onChange,
}: ContactFormInvestissementSectionProps) {
  return (
    <div className="space-y-3 rounded-lg border border-blue-200/80 bg-blue-50/50 px-3 py-3">
      <div>
        <p className="text-sm font-medium">Premier investissement</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Client actif : saisissez le contrat juste après la création. Exceltis (UC structurée)
          s&apos;affiche si vous choisissez assurance-vie ou PER.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            !value.addAfterCreate
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background hover:bg-muted"
          }`}
          onClick={() => onChange({ addAfterCreate: false })}
        >
          Plus tard
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            value.addAfterCreate
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background hover:bg-muted"
          }`}
          onClick={() => onChange({ addAfterCreate: true })}
        >
          Oui, ajouter maintenant
        </button>
      </div>
    </div>
  );
}
