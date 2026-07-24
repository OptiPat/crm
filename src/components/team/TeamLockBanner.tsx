import { Lock } from "lucide-react";

export function TeamLockBanner({
  heldBy,
  loading,
  message,
}: {
  heldBy: string | null;
  loading?: boolean;
  message?: string | null;
}) {
  if (!heldBy && !loading && !message) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        {loading
          ? "Acquisition du verrou d'édition…"
          : message ?? `Modification impossible : verrou détenu par ${heldBy}.`}
      </p>
    </div>
  );
}
