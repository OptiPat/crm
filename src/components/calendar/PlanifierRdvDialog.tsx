import { RdvPlanifierDialog } from "@/components/calendar/RdvPlanifierDialog";

export function PlanifierRdvDialog({
  open,
  onOpenChange,
  contactId,
  contactLabel,
  alerteId,
  tacheId,
  defaultTitle,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number;
  contactLabel: string;
  alerteId?: number | null;
  tacheId?: number | null;
  defaultTitle?: string;
  onCreated?: () => void;
}) {
  return (
    <RdvPlanifierDialog
      open={open}
      onOpenChange={onOpenChange}
      context={{
        kind: "linked",
        contactId,
        contactLabel,
        alerteId,
        tacheId,
        defaultTitle,
      }}
      onCreated={onCreated}
    />
  );
}
