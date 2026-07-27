import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  formatFilleulVolumeDisplay,
  formatFilleulVolumeField,
  getDirectBranchVolumeStatus,
  getManagerObjectiveColorStatus,
  getSelfNetworkVolumeStatus,
  getVolumeBranchColorStatus,
  getVolumeBranchDisplayAmount,
  ORGANISATION_DIRECT_BRANCH_VOLUME_TARGET,
  ORGANISATION_SELF_NETWORK_MAX_GENERATION,
  ORGANISATION_SELF_NETWORK_VOLUME_TARGET,
  parseFilleulVolumeField,
  type OrganisationVolumeRow,
} from "@/lib/organisation/organisation-branch-volumes";
import {
  ORGANISATION_MANAGER_VOLUME_TARGET,
} from "@/lib/organisation/organisation-manager-objective";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type OrganisationBranchVolumesPanelProps = {
  rows: OrganisationVolumeRow[];
  contacts: Contact[];
  /** Exercice clôturé : tout est figé, aucune saisie possible. */
  readOnly?: boolean;
  /** Exercice en cours (vs exercice passé non clôturé) : seul le volume perso + Objectif Manager sont saisis en live ; le volume branche reste calculé. */
  liveMode?: boolean;
  exerciceLabel?: string;
  onVolumeSave: (contact: Contact, volume: number | null) => void | Promise<void>;
  onManagerVolumeSave: (contact: Contact, volume: number | null) => void | Promise<void>;
  /** Correction du volume organisation (branche) — exercice passé non clôturé uniquement. */
  onBranchVolumeSave?: (contact: Contact, volume: number | null) => void | Promise<void>;
  onNodeClick?: (contact: Contact) => void;
  showTopBorder?: boolean;
};

function exerciceBranchCellTitle(row: OrganisationVolumeRow): string | undefined {
  if (row.generation === 0) {
    return "Volume branche exercice (propre + descendance filleuls actifs)";
  }
  if (row.generation === 1) {
    const ok =
      getDirectBranchVolumeStatus(row.branchVolume, row.generation) === "target_met";
    return ok
      ? `Filleul direct : objectif ${formatFilleulVolumeDisplay(ORGANISATION_DIRECT_BRANCH_VOLUME_TARGET)} (volume branche exercice) atteint`
      : `Filleul direct : objectif ${formatFilleulVolumeDisplay(ORGANISATION_DIRECT_BRANCH_VOLUME_TARGET)} (volume branche exercice) en cours`;
  }
  return "Volume branche de l'exercice en cours (propre + filleuls actifs)";
}

function managerObjectiveCellTitle(row: OrganisationVolumeRow): string | undefined {
  if (row.generation === 0 || !row.managerObjectiveEligible) return undefined;
  const ok = getManagerObjectiveColorStatus(row) === "target_met";
  return ok
    ? `Objectif Manager ${formatFilleulVolumeDisplay(ORGANISATION_MANAGER_VOLUME_TARGET)} atteint (cumul, sans limite de temps)`
    : `Objectif Manager ${formatFilleulVolumeDisplay(ORGANISATION_MANAGER_VOLUME_TARGET)} en cours (cumul branche)`;
}

function statusColorClasses(
  status: "target_met" | "below_target" | "not_applicable"
): string {
  if (status === "target_met") return "bg-emerald-50 text-emerald-800 font-semibold";
  if (status === "below_target") return "bg-amber-50 text-amber-800 font-semibold";
  return "text-foreground";
}

export function OrganisationBranchVolumesPanel({
  rows,
  contacts,
  readOnly = false,
  liveMode = true,
  exerciceLabel,
  onVolumeSave,
  onManagerVolumeSave,
  onBranchVolumeSave,
  onNodeClick,
  showTopBorder = true,
}: OrganisationBranchVolumesPanelProps) {
  const canEditBranchVolume = !readOnly && !liveMode && onBranchVolumeSave != null;
  const contactsById = useMemo(() => {
    const map = new Map<number, Contact>();
    for (const c of contacts) {
      if (c.id != null) map.set(c.id, c);
    }
    return map;
  }, [contacts]);

  if (rows.length === 0) return null;

  const selfRow = rows.find((r) => r.generation === 0);
  const selfNetworkVolume = selfRow?.networkVolumeExclSelf ?? 0;
  const selfNetworkStatus =
    selfRow != null ? getSelfNetworkVolumeStatus(selfNetworkVolume) : null;

  return (
    <div
      className={cn(
        "w-full px-3 sm:px-4 py-4",
        showTopBorder && "border-t border-border/60"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary shrink-0" aria-hidden />
            Volumes par branche
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl space-y-1">
            {readOnly ? (
              <span className="block">
                Exercice {exerciceLabel ?? "sélectionné"} clôturé (lecture seule) — snapshot figé.
              </span>
            ) : !liveMode ? (
              <span className="block">
                Exercice {exerciceLabel ?? "sélectionné"} non clôturé — vous pouvez corriger les
                volumes propre et organisation ci-dessous (ex. après un import Excel imprécis).
                Clôturez l&apos;exercice une fois les chiffres validés pour les figer.
              </span>
            ) : (
              <>
                <span className="block">
                  <span className="font-medium">Vol. branche</span> : exercice en cours (le sien +
                  filleuls actifs). Code couleur filleul direct (500 k€) :{" "}
                  <span className="inline-flex items-center gap-1.5 mr-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                    atteint
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                    en cours
                  </span>
                  .
                </span>
                <span className="block">
                  <span className="font-medium">Prime de dev</span> (badge en haut) :{" "}
                  {formatFilleulVolumeDisplay(ORGANISATION_SELF_NETWORK_VOLUME_TARGET)} niv. 1–
                  {ORGANISATION_SELF_NETWORK_MAX_GENERATION}, hors votre volume perso.{" "}
                  <span className="font-medium">Filleul direct</span> — objectif branche exercice :{" "}
                  {formatFilleulVolumeDisplay(ORGANISATION_DIRECT_BRANCH_VOLUME_TARGET)}.
                </span>
                <span className="block">
                  <span className="font-medium">Objectif Manager (cumul)</span> : hors exercice, Junior
                  / Consultant → Manager à{" "}
                  {formatFilleulVolumeDisplay(ORGANISATION_MANAGER_VOLUME_TARGET)}, sans limite de
                  temps — colonne dédiée, distincte de la prime de dev et volume branche exercice.
                </span>
              </>
            )}
          </p>
        </div>
        {selfRow != null && (
          <span
            className={cn(
              "text-xs tabular-nums shrink-0 pt-0.5 rounded-md px-2 py-1",
              selfNetworkStatus === "target_met" &&
                "bg-emerald-50 text-emerald-800 font-semibold",
              selfNetworkStatus === "below_target" &&
                "bg-amber-50 text-amber-800 font-semibold"
            )}
          >
            Prime de dev {ORGANISATION_SELF_NETWORK_MAX_GENERATION} niv. :{" "}
            {formatFilleulVolumeDisplay(selfNetworkVolume)}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Filleul</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right w-36">
                Objectif Manager
                <span className="block font-normal normal-case text-[10px]">cumul</span>
              </th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right w-28">
                Volume
                <span className="block font-normal normal-case text-[10px]">perso</span>
                <span className="block font-normal normal-case text-[10px]">exercice</span>
              </th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right w-32">
                Volume
                <span className="block font-normal normal-case text-[10px]">organisation</span>
                <span className="block font-normal normal-case text-[10px]">exercice</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const contact = contactsById.get(row.contactId);
              if (!contact) return null;
              const exerciceBranchStatus = getVolumeBranchColorStatus(row);
              const exerciceDisplay = getVolumeBranchDisplayAmount(row);
              const exerciceColored = exerciceBranchStatus !== "not_applicable";
              const managerStatus = getManagerObjectiveColorStatus(row);
              const managerColored = managerStatus !== "not_applicable";
              return (
                <tr key={row.contactId} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-2">
                    {onNodeClick ? (
                      <button
                        type="button"
                        className="text-left hover:text-primary hover:underline truncate max-w-[14rem] block"
                        style={{ paddingLeft: `${row.generation * 0.75}rem` }}
                        onClick={() => onNodeClick(contact)}
                      >
                        {row.label}
                      </button>
                    ) : (
                      <span
                        className="truncate max-w-[14rem] block"
                        style={{ paddingLeft: `${row.generation * 0.75}rem` }}
                      >
                        {row.label}
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2",
                      managerColored && statusColorClasses(managerStatus)
                    )}
                  >
                    {row.generation === 0 || !row.managerObjectiveEligible ? (
                      <span className="block text-right text-muted-foreground text-xs">—</span>
                    ) : readOnly || !liveMode ? (
                      <span
                        className="block text-right tabular-nums"
                        title={managerObjectiveCellTitle(row)}
                      >
                        {formatFilleulVolumeDisplay(row.managerVolume)}
                      </span>
                    ) : (
                      <Input
                        key={`mgr-${row.contactId}-${contact.filleul_volume_manager ?? "empty"}`}
                        className="h-8 w-full max-w-[9rem] ml-auto text-right tabular-nums bg-background"
                        inputMode="decimal"
                        placeholder="0"
                        title={managerObjectiveCellTitle(row)}
                        defaultValue={formatFilleulVolumeField(row.managerVolume)}
                        onBlur={(e) => {
                          const parsed = parseFilleulVolumeField(e.target.value);
                          if (parsed == null) return;
                          if (parsed === row.managerVolume) return;
                          void onManagerVolumeSave(contact, parsed === 0 ? null : parsed);
                        }}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {readOnly ? (
                      <span className="block text-right tabular-nums">
                        {formatFilleulVolumeDisplay(row.ownVolume)}
                      </span>
                    ) : (
                      <Input
                        key={`vol-${row.contactId}-${liveMode ? contact.filleul_volume ?? "empty" : row.ownVolume}`}
                        className={cn("h-8 w-full max-w-[8rem] ml-auto text-right tabular-nums")}
                        inputMode="decimal"
                        placeholder="0"
                        defaultValue={formatFilleulVolumeField(row.ownVolume)}
                        onBlur={(e) => {
                          const parsed = parseFilleulVolumeField(e.target.value);
                          if (parsed == null) return;
                          if (parsed === row.ownVolume) return;
                          void onVolumeSave(contact, liveMode && parsed === 0 ? null : parsed);
                        }}
                      />
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums font-medium",
                      exerciceColored && statusColorClasses(exerciceBranchStatus),
                      !exerciceColored && "text-foreground"
                    )}
                    title={exerciceBranchCellTitle(row)}
                  >
                    {canEditBranchVolume ? (
                      <Input
                        key={`branch-${row.contactId}-${row.branchVolume}`}
                        className="h-8 w-full max-w-[9rem] ml-auto text-right tabular-nums bg-background"
                        inputMode="decimal"
                        placeholder="0"
                        defaultValue={formatFilleulVolumeField(exerciceDisplay)}
                        onBlur={(e) => {
                          const parsed = parseFilleulVolumeField(e.target.value);
                          if (parsed == null) return;
                          if (parsed === row.branchVolume) return;
                          void onBranchVolumeSave?.(contact, parsed);
                        }}
                      />
                    ) : (
                      formatFilleulVolumeDisplay(exerciceDisplay)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
