type TimedAppointment = {
  id: string;
  startTime: string;
  endTime: string;
};

export type AppointmentLane = {
  columnIndex: number;
  columnCount: number;
};

type ParsedAppointment<T extends TimedAppointment> = {
  appointment: T;
  start: number;
  end: number;
};

export function layoutOverlappingAppointments<T extends TimedAppointment>(
  appointments: T[],
): Map<string, AppointmentLane> {
  const parsed = appointments
    .map((appointment) => ({
      appointment,
      start: new Date(appointment.startTime).getTime(),
      end: new Date(appointment.endTime).getTime(),
    }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort(
      (a, b) =>
        a.start - b.start ||
        a.end - b.end ||
        a.appointment.id.localeCompare(b.appointment.id),
    );

  const layouts = new Map<string, AppointmentLane>();
  let group: ParsedAppointment<T>[] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;

  const assignGroupLanes = (overlappingGroup: ParsedAppointment<T>[]) => {
    if (overlappingGroup.length === 0) return;

    const laneEnds: number[] = [];
    const groupLayouts: { id: string; columnIndex: number }[] = [];

    for (const item of overlappingGroup) {
      let columnIndex = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
      if (columnIndex === -1) columnIndex = laneEnds.length;

      laneEnds[columnIndex] = item.end;
      groupLayouts.push({ id: item.appointment.id, columnIndex });
    }

    const columnCount = laneEnds.length;
    for (const layout of groupLayouts) {
      layouts.set(layout.id, { columnIndex: layout.columnIndex, columnCount });
    }
  };

  for (const item of parsed) {
    if (group.length > 0 && item.start >= groupEnd) {
      assignGroupLanes(group);
      group = [];
      groupEnd = Number.NEGATIVE_INFINITY;
    }

    group.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  }

  assignGroupLanes(group);

  return layouts;
}
