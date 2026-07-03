import {
  FILLEUL_QUALIFICATION_META,
  FILLEUL_TITRE_META,
  parseFilleulQualification,
  parseFilleulTitre,
} from "@/lib/organisation/filleul-ranks";
import { RankIcon } from "@/components/organisation/FilleulRankIcons";
import { cn } from "@/lib/utils";

type FilleulRankBadgesProps = {
  titre?: string | null;
  qualification?: string | null;
  compact?: boolean;
  className?: string;
};

export function FilleulRankBadges({
  titre,
  qualification,
  compact,
  className,
}: FilleulRankBadgesProps) {
  const titreId = parseFilleulTitre(titre);
  const qualId = parseFilleulQualification(qualification);
  if (!titreId && !qualId) return null;

  const titreMeta = titreId ? FILLEUL_TITRE_META[titreId] : null;
  const qualMeta = qualId ? FILLEUL_QUALIFICATION_META[qualId] : null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {titreMeta && (
        <span
          title={`Titre : ${titreMeta.label}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-emerald-200/60 bg-white/80 px-1.5 py-0.5",
            compact ? "text-[9px]" : "text-[10px]"
          )}
        >
          <RankIcon kind={titreMeta.icon} />
          <span className="font-medium text-emerald-900">{titreMeta.label}</span>
        </span>
      )}
      {qualMeta && (
        <span
          title={`Qualification : ${qualMeta.label}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5",
            compact ? "text-[9px]" : "text-[10px]"
          )}
        >
          <RankIcon kind={qualMeta.icon} />
          <span className="font-medium text-muted-foreground">{qualMeta.label}</span>
        </span>
      )}
    </div>
  );
}
