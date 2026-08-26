export type ParsedTextHistoryAppointment = {
  dateText: string;
  normalizedDate: string | null;
  body: string;
  next: string;
  hasNext: boolean;
  hasNoShow: boolean;
};

export type ParsedTextHistory = {
  information: string;
  appointments: ParsedTextHistoryAppointment[];
};

export type DeletedTextHistoryBlockBackup = {
  type: "appointment" | "next";
  label: string;
  content: string;
};

const monthLabels = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
] as const;

const noShowMarker = "NO ASISTIO";

const monthNumbers: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

const clinicalDateLinePattern =
  /^\s*(\d{1,2}[-/](?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SEPT|OCT|NOV|DIC|\d{1,2})[-/]\d{2,4})\b(.*)$/i;
const clinicalDatePattern =
  /^(\d{1,2})[-/]([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,4}|\d{1,2})[-/](\d{2,4})$/i;
const nextMarkerPattern = /\bNEXT\s*:\s*/i;

export function parseLinkedTextHistory(value: string): ParsedTextHistory {
  const lines = normalizeToLf(value).split("\n");
  const informationLines: string[] = [];
  const appointments: ParsedTextHistoryAppointment[] = [];
  let draft: AppointmentDraft | null = null;

  for (const line of lines) {
    const dateMatch = matchClinicalDateLine(line);

    if (dateMatch) {
      if (draft) {
        appointments.push(toAppointment(draft));
      }

      draft = {
        dateText: dateMatch.dateText,
        bodyLines: [],
        nextLines: [],
        nextStarted: false,
      };

      appendAppointmentLine(draft, dateMatch.rest.trimStart());
      continue;
    }

    if (draft) {
      appendAppointmentLine(draft, line);
      continue;
    }

    informationLines.push(line);
  }

  if (draft) {
    appointments.push(toAppointment(draft));
  }

  return {
    information: trimTrailingBlankLines(informationLines).join("\n"),
    appointments,
  };
}

export function serializeLinkedTextHistory(
  history: ParsedTextHistory,
  lineEnding: "\r\n" | "\n" = "\n",
) {
  const sections: string[] = [];
  const information = normalizeBlock(history.information);

  if (information.length > 0) {
    sections.push(information);
  }

  for (const appointment of history.appointments) {
    sections.push(serializeAppointment(appointment));
  }

  return sections.join("\n").replace(/\n/g, lineEnding);
}

export function createTextHistoryAppointment(
  date = new Date(),
): ParsedTextHistoryAppointment {
  const day = String(date.getDate()).padStart(2, "0");
  const month = monthLabels[date.getMonth()] ?? "ENE";
  const year = String(date.getFullYear()).slice(-2);
  const dateText = `${day}-${month}-${year}`;

  return {
    dateText,
    normalizedDate: normalizeClinicalDateText(dateText),
    body: "",
    next: "",
    hasNext: false,
    hasNoShow: false,
  };
}

export function normalizeTextHistoryAppointment(
  appointment: ParsedTextHistoryAppointment,
): ParsedTextHistoryAppointment {
  return {
    ...appointment,
    normalizedDate: normalizeClinicalDateText(appointment.dateText),
    hasNext: appointment.hasNext || appointment.next.trim().length > 0,
    hasNoShow: hasNoShowText(`${appointment.body}\n${appointment.next}`),
  };
}

export function markTextHistoryAppointmentNoShow(
  appointment: ParsedTextHistoryAppointment,
): ParsedTextHistoryAppointment {
  if (hasNoShowText(`${appointment.body}\n${appointment.next}`)) {
    return normalizeTextHistoryAppointment(appointment);
  }

  const body = appointment.body.trimEnd();

  return normalizeTextHistoryAppointment({
    ...appointment,
    body: body.length > 0 ? `${body}\n${noShowMarker}` : noShowMarker,
  });
}

export function replaceTextHistoryAppointment(
  history: ParsedTextHistory,
  index: number,
  appointment: ParsedTextHistoryAppointment,
): ParsedTextHistory {
  return {
    ...history,
    appointments: history.appointments.map(
      (currentAppointment, currentIndex) =>
        currentIndex === index
          ? normalizeTextHistoryAppointment(appointment)
          : currentAppointment,
    ),
  };
}

export function appendTextHistoryAppointment(
  history: ParsedTextHistory,
  appointment = createTextHistoryAppointment(),
): ParsedTextHistory {
  return {
    ...history,
    appointments: [
      ...history.appointments,
      normalizeTextHistoryAppointment(appointment),
    ],
  };
}

export function removeTextHistoryAppointment(
  history: ParsedTextHistory,
  index: number,
): ParsedTextHistory {
  return {
    ...history,
    appointments: history.appointments.filter(
      (_, currentIndex) => currentIndex !== index,
    ),
  };
}

export function serializeTextHistoryAppointmentBlock(
  appointment: ParsedTextHistoryAppointment,
) {
  return serializeAppointment(normalizeTextHistoryAppointment(appointment));
}

export function serializeTextHistoryNextBlock(next: string) {
  return serializeNextLines(next, true).join("\n");
}

export function serializeDeletedTextHistoryBlockBackup({
  type,
  label,
  content,
}: DeletedTextHistoryBlockBackup) {
  const blockTypeLabel = type === "appointment" ? "Cita" : "NEXT";

  return [`Tipo: ${blockTypeLabel}`, `Referencia: ${label}`, "", content].join(
    "\n",
  );
}

export function normalizeClinicalDateText(dateText: string) {
  const match = dateText.trim().match(clinicalDatePattern);
  if (!match) return null;

  const day = Number.parseInt(match[1], 10);
  const month = parseMonth(match[2]);
  const year = parseYear(match[3]);

  if (!month || !year) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export function hasNoShowText(value: string) {
  return normalizeSearchText(value).includes("NO ASISTI");
}

function matchClinicalDateLine(line: string) {
  const match = line.match(clinicalDateLinePattern);
  if (!match) return null;

  return {
    dateText: match[1],
    rest: match[2] ?? "",
  };
}

type AppointmentDraft = {
  dateText: string;
  bodyLines: string[];
  nextLines: string[];
  nextStarted: boolean;
};

function appendAppointmentLine(draft: AppointmentDraft, line: string) {
  if (draft.nextStarted) {
    draft.nextLines.push(stripStandaloneNextMarker(line));
    return;
  }

  const nextMatch = line.match(nextMarkerPattern);
  if (!nextMatch || nextMatch.index === undefined) {
    draft.bodyLines.push(line);
    return;
  }

  const beforeNext = line.slice(0, nextMatch.index).trimEnd();
  const afterNext = line.slice(nextMatch.index + nextMatch[0].length);

  if (beforeNext.trim().length > 0) {
    draft.bodyLines.push(beforeNext);
  }

  draft.nextLines.push(afterNext);
  draft.nextStarted = true;
}

function stripStandaloneNextMarker(line: string) {
  return line.replace(/^\s*NEXT\s*:\s*/i, "");
}

function toAppointment(draft: AppointmentDraft): ParsedTextHistoryAppointment {
  const body = trimTrailingBlankLines(draft.bodyLines).join("\n");
  const next = trimTrailingBlankLines(draft.nextLines).join("\n");

  return {
    dateText: draft.dateText,
    normalizedDate: normalizeClinicalDateText(draft.dateText),
    body,
    next,
    hasNext: draft.nextStarted,
    hasNoShow: hasNoShowText(`${body}\n${next}`),
  };
}

function serializeAppointment(appointment: ParsedTextHistoryAppointment) {
  const lines: string[] = [];
  const bodyLines = splitBlockLines(appointment.body);

  if (bodyLines.length > 0) {
    const [firstBodyLine, ...remainingBodyLines] = bodyLines;
    lines.push(
      `${appointment.dateText}${firstBodyLine ? ` ${firstBodyLine.trimStart()}` : ""}`,
    );
    lines.push(...remainingBodyLines);
  } else {
    lines.push(appointment.dateText);
  }

  lines.push(...serializeNextLines(appointment.next, appointment.hasNext));

  return lines.join("\n");
}

function serializeNextLines(next: string, hasNext: boolean) {
  const nextLines = splitBlockLines(next);

  if (!hasNext && nextLines.length === 0) {
    return [];
  }

  const [firstNextLine, ...remainingNextLines] = nextLines;

  return [
    `          NEXT: ${(firstNextLine ?? "").trimStart()}`,
    ...remainingNextLines.map((line) => `                ${line.trimStart()}`),
  ];
}

function splitBlockLines(value: string) {
  const normalized = normalizeBlock(value);
  if (normalized.length === 0) return [];

  return normalized.split("\n");
}

function normalizeBlock(value: string) {
  return trimTrailingBlankLines(normalizeToLf(value).split("\n")).join("\n");
}

function normalizeToLf(value: string) {
  return value.replace(/\r\n|\r/g, "\n");
}

function trimTrailingBlankLines(lines: string[]) {
  const next = [...lines];

  while (next.length > 0 && next[next.length - 1].trim().length === 0) {
    next.pop();
  }

  return next;
}

function parseMonth(value: string) {
  if (/^\d{1,2}$/.test(value)) {
    const numericMonth = Number.parseInt(value, 10);
    return numericMonth >= 1 && numericMonth <= 12 ? numericMonth : null;
  }

  const key = normalizeSearchText(value).toLowerCase().slice(0, 4);
  return monthNumbers[key] ?? monthNumbers[key.slice(0, 3)] ?? null;
}

function parseYear(value: string) {
  if (value.length === 2) {
    return 2000 + Number.parseInt(value, 10);
  }

  return Number.parseInt(value, 10);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
