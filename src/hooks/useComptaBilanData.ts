import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getComptaDepenses,
  getComptaDeplacements,
  getComptaEncaissements,
  type ComptaDepense,
  type ComptaDeplacement,
  type ComptaEncaissement,
} from "@/lib/api/tauri-compta";
import { comptaBilanMonthsToLoad } from "@/lib/compta/compta-bilan";

export function useComptaBilanData(year: number, month: number) {
  const [depenses, setDepenses] = useState<ComptaDepense[]>([]);
  const [encaissements, setEncaissements] = useState<ComptaEncaissement[]>([]);
  const [deplacements, setDeplacements] = useState<ComptaDeplacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthsToLoad = useMemo(() => comptaBilanMonthsToLoad(year, month), [year, month]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const depLists = await Promise.all(
        monthsToLoad.map(({ year: y, month: m }) => getComptaDepenses(y, m))
      );
      const encLists = await Promise.all(
        monthsToLoad.map(({ year: y, month: m }) => getComptaEncaissements(y, m))
      );
      const deplLists = await Promise.all(
        monthsToLoad.map(({ year: y, month: m }) => getComptaDeplacements(y, m))
      );

      const dedupeById = <T extends { id: number }>(rows: T[]): T[] => {
        const map = new Map<number, T>();
        for (const row of rows) map.set(row.id, row);
        return [...map.values()];
      };

      setDepenses(dedupeById(depLists.flat()));
      setEncaissements(dedupeById(encLists.flat()));
      setDeplacements(dedupeById(deplLists.flat()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [monthsToLoad]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { depenses, encaissements, deplacements, loading, error, reload };
}
