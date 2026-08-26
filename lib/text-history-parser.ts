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
  dic: 12
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
        nextStarted: false
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
    appointments
  };
}

export function serializeLinkedTextHistory(
  history: ParsedTextHistory,
  lineEnding: "\r\n" | "\n" = "\n"
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
    String(day).padStart(2, "0")
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
    rest: match[2] ?? ""
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
    hasNoShow: hasNoShowText(`${body}\n${next}`)
  };
}

function serializeAppointment(appointment: ParsedTextHistoryAppointment) {
  const lines: string[] = [];
  const bodyLines = splitBlockLines(appointment.body);
  const nextLines = splitBlockLines(appointment.next);

  if (bodyLines.length > 0) {
    const [firstBodyLine, ...remainingBodyLines] = bodyLines;
    lines.push(`${appointment.dateText}${firstBodyLine ? ` ${firstBodyLine.trimStart()}` : ""}`);
    lines.push(...remainingBodyLines);
  } else {
    lines.push(appointment.dateText);
  }

  if (appointment.hasNext || nextLines.length > 0) {
    const [firstNextLine, ...remainingNextLines] = nextLines;
    lines.push(`          NEXT: ${(firstNextLine ?? "").trimStart()}`);
    lines.push(...remainingNextLines.map((line) => `                ${line.trimStart()}`));
  }

  return lines.join("\n");
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
