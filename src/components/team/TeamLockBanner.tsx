import { Lock } from "lucide-react";

export function TeamLockBanner({
  heldBy,
  loading,
}: {
  heldBy: string | null;
  loading?: boolean;
}) {
  if (!heldBy && !loading) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        {loading
          ? "Acquisition du verrou d'édition…"
          : `Modification impossible : verrou détenu par ${heldBy}.`}
      </p>
    </div>
  );
}
