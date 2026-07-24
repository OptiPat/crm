import type { TeamAuditEntry } from "@/lib/api/tauri-team-collaboration";

export function TeamAuditList({ entries }: { entries: TeamAuditEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-background/60 p-3 text-xs">
      <p className="font-medium">Dernières actions partagées</p>
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {entries.map((entry) => (
          <div key={entry.itemId} className="border-b border-border/60 pb-2 last:border-0">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-medium">
                {entry.action} · {entry.entityType} {entry.entityId}
              </span>
              <span className="text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString("fr-FR")}
              </span>
            </div>
            <p className="text-muted-foreground">
              {entry.detail ?? "Action enregistrée"} · acteur {entry.actorId}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
