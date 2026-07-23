import { Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { type Contact as ContactRecord } from "@/lib/api/tauri-contacts";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";

type ContactDetailSyntheseParrainageCardProps = {
  contact: ContactRecord;
  mesFilleulsCount: number;
  header: React.ReactNode;
};

function formatInvitationType(value?: string | null): string | null {
  if (value === "JD") return "Journée Découverte (JD)";
  if (value === "PO") return "PO";
  return null;
}

function formatPresence(value?: number | null): string | null {
  if (value === 1) return "Présent";
  if (value === 0) return "Absent";
  return null;
}

export function ContactDetailSyntheseParrainageCard({
  contact,
  mesFilleulsCount,
  header,
}: ContactDetailSyntheseParrainageCardProps) {
  const invitationType = formatInvitationType(contact.type_invitation_filleul);
  const presence = formatPresence(contact.presence_invitation_filleul);

  return (
    <Card>
      {header}
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
          Parrain, dates réseau, titre, qualification et volumes : voir le module{" "}
          <span className="font-medium">Organisation</span>.
        </p>

        {invitationType && (
          <div>
            <span className="text-muted-foreground text-sm">Type d&apos;invitation : </span>
            {invitationType}
          </div>
        )}
        {presence && (
          <div>
            <span className="text-muted-foreground text-sm">Présence à l&apos;invitation : </span>
            {presence}
          </div>
        )}
        {contact.date_dernier_contact_filleul && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground text-sm">Dernier contact (filleul) : </span>
              <span className="font-medium text-indigo-700">
                {formatCalendarDateFr(contact.date_dernier_contact_filleul)}
              </span>
            </div>
          </div>
        )}
        {contact.date_prochain_suivi_filleul && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground text-sm">Prochain suivi (filleul) : </span>
              <span className="font-medium text-orange-700">
                {formatCalendarDateFr(contact.date_prochain_suivi_filleul)}
              </span>
            </div>
          </div>
        )}

        {mesFilleulsCount > 0 && (
          <p className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-muted/20">
            Ce contact est parrain de {mesFilleulsCount} filleul
            {mesFilleulsCount > 1 ? "s" : ""}. Modifier les liens depuis le module Organisation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
