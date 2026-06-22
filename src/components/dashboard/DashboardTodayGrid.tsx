import { TachesPreview } from "./TachesPreview";
import { CalendarTodayPreview } from "./CalendarTodayPreview";
import { BirthdaysTodayPreview } from "./BirthdaysTodayPreview";
import { ScpiCampaignPreview } from "./ScpiCampaignPreview";

export function DashboardTodayGrid({
  onNavigate,
  onOpenContact,
  currentPage,
}: {
  onNavigate?: (page: string) => void;
  onOpenContact?: (contactId: number) => void;
  currentPage?: string;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch min-h-[280px]">
        <CalendarTodayPreview onOpenContact={onOpenContact} />
        <TachesPreview onNavigate={onNavigate} onOpenContact={onOpenContact} />
        <BirthdaysTodayPreview onOpenContact={onOpenContact} />
      </div>
      <ScpiCampaignPreview onNavigate={onNavigate} currentPage={currentPage} />
    </div>
  );
}
