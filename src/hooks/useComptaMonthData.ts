import { useCallback, useEffect, useState } from "react";
import {
  getComptaConfig,
  getComptaDepenses,
  getComptaDeplacements,
  getComptaEncaissements,
  type ComptaConfig,
  type ComptaDepense,
  type ComptaDeplacement,
  type ComptaEncaissement,
} from "@/lib/api/tauri-compta";

export function useComptaMonthData(year: number, month: number) {
  const [config, setConfig] = useState<ComptaConfig | null>(null);
  const [depenses, setDepenses] = useState<ComptaDepense[]>([]);
  const [encaissements, setEncaissements] = useState<ComptaEncaissement[]>([]);
  const [deplacements, setDeplacements] = useState<ComptaDeplacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, dep, enc, depl] = await Promise.all([
        getComptaConfig(),
        getComptaDepenses(year, month),
        getComptaEncaissements(year, month),
        getComptaDeplacements(year, month),
      ]);
      setConfig(cfg);
      setDepenses(dep);
      setEncaissements(enc);
      setDeplacements(depl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    config,
    setConfig,
    depenses,
    setDepenses,
    encaissements,
    setEncaissements,
    deplacements,
    setDeplacements,
    loading,
    error,
    reload,
  };
}
