import { Badge } from "@/components/ui/badge";
import { appointmentStatusLabels, appointmentStatusTones } from "@/components/schedule/constants";

export function AppointmentStatusBadge({ status }: { status: string }) {
  return <Badge tone={appointmentStatusTones[status] ?? "neutral"}>{appointmentStatusLabels[status] ?? status}</Badge>;
}