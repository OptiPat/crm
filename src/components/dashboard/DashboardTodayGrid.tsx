import { TachesPreview } from "./TachesPreview";
import { CalendarTodayPreview } from "./CalendarTodayPreview";
import { BirthdaysTodayPreview } from "./BirthdaysTodayPreview";

export function DashboardTodayGrid({
  onNavigate,
  onOpenContact,
}: {
  onNavigate?: (page: string) => void;
  onOpenContact?: (contactId: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch min-h-[280px]">
      <BirthdaysTodayPreview onOpenContact={onOpenContact} />
      <CalendarTodayPreview onOpenContact={onOpenContact} />
      <TachesPreview onNavigate={onNavigate} onOpenContact={onOpenContact} />
    </div>
  );
}
