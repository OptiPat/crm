import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted/60", className)} {...props} />
}

/** Lignes fantômes pendant le chargement d'une liste (évite le saut de mise en page). */
function ListSkeleton({
  rows = 5,
  rowClassName = "h-16",
  className,
}: {
  rows?: number
  rowClassName?: string
  className?: string
}) {
  return (
    <div className={cn("space-y-2 py-2", className)} role="status" aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-xl", rowClassName)} />
      ))}
    </div>
  )
}

export { Skeleton, ListSkeleton }
