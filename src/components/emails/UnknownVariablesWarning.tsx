import { useMemo } from "react";
import type { AgendaLink } from "@/lib/api/tauri-settings";
import { findUnknownTemplateVariables } from "@/lib/emails/template-variable-check";

/** Encadré sous un éditeur : variables mal tapées (`{{prénom}}`…) de cet objet + message. */
export function UnknownVariablesWarning({
  texts,
  agendaLinks,
}: {
  texts: string[];
  agendaLinks?: AgendaLink[];
}) {
  const joined = texts.join(" ");
  const unknown = useMemo(
    () => findUnknownTemplateVariables(joined, agendaLinks),
    [joined, agendaLinks]
  );
  if (unknown.length === 0) return null;
  const plural = unknown.length > 1;
  return (
    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      {plural ? "Variables inconnues" : "Variable inconnue"} : {unknown.join(", ")}.{" "}
      {plural ? "Elles partiraient telles quelles" : "Elle partirait telle quelle"} dans
      l&apos;email — écrivez-les exactement comme dans « Variables à insérer » (minuscules, sans
      espace).
    </p>
  );
}
