import { cn } from "@/lib/utils";

export function ContactInitialsAvatar({
  prenom,
  nom,
  className,
}: {
  prenom: string;
  nom: string;
  className?: string;
}) {
  const initials =
    `${prenom?.trim().charAt(0) ?? ""}${nom?.trim().charAt(0) ?? ""}`.toUpperCase() || "?";

  return (
    <div
      className={cn(
        "h-10 w-10 rounded-full bg-primary/10 text-primary font-semibold text-sm",
        "flex items-center justify-center shrink-0",
        className
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}
