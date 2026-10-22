import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getComptaBilanData,
  type ComptaDepense,
  type ComptaDeplacement,
  type ComptaEncaissement,
} from "@/lib/api/tauri-compta";
import { userErrorMessage } from "@/lib/api/invoke-error";

export function useComptaBilanData(
  bilanYear: number,
  evolutionEndYear: number,
  evolutionEndMonth: number
) {
  const [depenses, setDepenses] = useState<ComptaDepense[]>([]);
  const [encaissements, setEncaissements] = useState<ComptaEncaissement[]>([]);
  const [deplacements, setDeplacements] = useState<ComptaDeplacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadKey = useMemo(
    () => `${bilanYear}-${evolutionEndYear}-${evolutionEndMonth}`,
    [bilanYear, evolutionEndYear, evolutionEndMonth]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getComptaBilanData(bilanYear, evolutionEndYear, evolutionEndMonth);
      setDepenses(data.depenses);
      setEncaissements(data.encaissements);
      setDeplacements(data.deplacements);
    } catch (e) {
      setError(userErrorMessage(e, "Impossible de charger le bilan"));
    } finally {
      setLoading(false);
    }
  }, [bilanYear, evolutionEndYear, evolutionEndMonth]);

  useEffect(() => {
    void reload();
  }, [reload, loadKey]);

  return { depenses, encaissements, deplacements, loading, error, reload };
}
