import { useEffect, useMemo, useState } from "react";
import { getAllContacts } from "@/lib/api/tauri-contacts";

function contactDisplayName(prenom: string | null | undefined, nom: string | null | undefined): string {
  return [prenom, nom].filter(Boolean).join(" ").trim();
}

export function useComptaNameSuggestions(history: string[]): string[] {
  const [contactNames, setContactNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getAllContacts()
      .then((contacts) => {
        if (cancelled) return;
        const names = contacts
          .map((c) => contactDisplayName(c.prenom, c.nom))
          .filter((name) => name.length > 0);
        setContactNames(names);
      })
      .catch(() => {
        if (!cancelled) setContactNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const merged = new Set<string>();
    for (const name of history) {
      const trimmed = name.trim();
      if (trimmed) merged.add(trimmed);
    }
    for (const name of contactNames) merged.add(name);
    return [...merged].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }, [history, contactNames]);
}
