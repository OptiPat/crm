import { useEffect, useState } from "react";
import { getAllInvestissements, type Investissement } from "@/lib/api/tauri-investissements";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";

let cached: Investissement[] | null = null;
let inflight: Promise<Investissement[]> | null = null;

export function invalidateNomProduitInvestissementsCache(): void {
  cached = null;
}

export function loadNomProduitInvestissements(): Promise<Investissement[]> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = getAllInvestissements()
    .then((rows) => {
      cached = rows;
      return rows;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Investissements du portefeuille — cache partagé entre pickers nom produit. */
export function useNomProduitInvestissements(): {
  investissements: Investissement[];
  loading: boolean;
} {
  const [investissements, setInvestissements] = useState<Investissement[]>(cached ?? []);
  const [loading, setLoading] = useState(cached == null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoading(cached == null);
      void loadNomProduitInvestissements().then((rows) => {
        if (!cancelled) {
          setInvestissements(rows);
          setLoading(false);
        }
      });
    };
    load();
    return subscribeInvestissementsChanged(() => {
      invalidateNomProduitInvestissementsCache();
      load();
    });
  }, []);

  return { investissements, loading };
}
