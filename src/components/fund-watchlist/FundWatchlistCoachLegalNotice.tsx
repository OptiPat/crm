import { FUND_WATCHLIST_COACH_LEGAL_NOTICE } from "@/lib/fund-watchlist/fund-watchlist-coach-legal";

type Props = {
  variant?: "dialog" | "print";
};

export function FundWatchlistCoachLegalNotice({ variant = "dialog" }: Props) {
  if (variant === "print") {
    return (
      <footer className="coach-print-legal">
        <p className="coach-print-legal-title">Mentions légales</p>
        <p>{FUND_WATCHLIST_COACH_LEGAL_NOTICE}</p>
      </footer>
    );
  }

  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground border-t pt-3">
      <span className="font-medium text-foreground/80">Mentions légales — </span>
      {FUND_WATCHLIST_COACH_LEGAL_NOTICE}
    </p>
  );
}
