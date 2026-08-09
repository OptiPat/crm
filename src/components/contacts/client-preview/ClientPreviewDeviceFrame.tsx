import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ClientPreviewViewport } from "./ClientPreviewAdvisorPanel";

function MobileStatusBar() {
  const time = new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="flex items-center justify-between bg-[var(--cp-bg)] px-6 pt-3 pb-1 font-sans text-[11px] text-[var(--cp-ink)]"
      aria-hidden
    >
      <span className="tabular-nums">{time}</span>
      <div className="h-[20px] w-[76px] rounded-full bg-neutral-900 shadow-inner" />
      <div className="flex items-center gap-1.5">
        <span className="relative h-2.5 w-3.5 rounded-[2px] border border-neutral-400/80">
          <span className="absolute inset-y-[1px] left-[1px] right-[3px] rounded-[1px] bg-neutral-700" />
          <span className="absolute -right-[3px] top-1/2 h-1 w-[2px] -translate-y-1/2 rounded-r-[1px] bg-neutral-400/80" />
        </span>
      </div>
    </div>
  );
}

export interface ClientPreviewDeviceFrameProps {
  children: ReactNode;
  viewport: ClientPreviewViewport;
  /** Cadre simulateur (conseiller). Désactivé sur le portail client réel. */
  framed?: boolean;
}

export function ClientPreviewDeviceFrame({
  children,
  viewport,
  framed = true,
}: ClientPreviewDeviceFrameProps) {
  const isMobile = viewport === "mobile";

  if (!framed) {
    return (
      <div
        className={cn(
          "relative w-full overflow-x-hidden",
          isMobile ? "max-w-[430px]" : "max-w-3xl"
        )}
      >
        <div className="min-h-[100dvh] bg-[var(--cp-bg)]">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full",
        isMobile ? "max-w-[390px]" : "max-w-3xl"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute rounded-[3rem] bg-neutral-400/10 blur-2xl",
          isMobile ? "-inset-4" : "-inset-6"
        )}
        aria-hidden
      />

      <div
        className={cn(
          "relative overflow-hidden",
          isMobile
            ? "rounded-[2.5rem] border-[6px] border-neutral-950 bg-neutral-950 shadow-2xl shadow-neutral-400/30"
            : "rounded-2xl border border-neutral-200/80 bg-white shadow-xl shadow-neutral-200/40 ring-1 ring-neutral-100"
        )}
      >
        {isMobile ? (
          <div className="flex justify-center pt-1.5 pb-1" aria-hidden>
            <div className="h-1 w-16 rounded-full bg-neutral-800" />
          </div>
        ) : (
          <div
            className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-2.5"
            aria-hidden
          >
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <div className="mx-auto flex h-6 max-w-xs flex-1 items-center justify-center gap-1 rounded-md border border-neutral-200/60 bg-white px-3 font-sans text-[10px] text-neutral-400 shadow-sm">
              <span className="text-emerald-600" aria-hidden>
                🔒
              </span>
              <span className="font-medium text-neutral-600">
                espace-client.patrimoine-crm.fr
              </span>
            </div>
          </div>
        )}

        <div
          className={cn(
            "overflow-x-hidden overflow-y-auto bg-[var(--cp-bg)]",
            isMobile
              ? "mx-0.5 mb-0.5 max-h-[min(78vh,820px)] min-h-[640px] rounded-[2.2rem]"
              : "max-h-[min(85vh,900px)] min-h-[580px]"
          )}
        >
          {isMobile ? <MobileStatusBar /> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
