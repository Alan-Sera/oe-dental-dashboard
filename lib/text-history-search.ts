import type {
  ParsedTextHistory,
  ParsedTextHistoryAppointment,
} from "@/lib/text-history-parser";

export type TextHistoryHighlightSegment = {
  text: string;
  highlighted: boolean;
};

export type TextHistoryAppointmentSearchMatch = {
  index: number;
  totalMatches: number;
  dateMatches: number;
  normalizedDateMatches: number;
  bodyMatches: number;
  nextMatches: number;
};

export type TextHistorySearchSummary = {
  query: string;
  hasQuery: boolean;
  informationMatches: number;
  appointmentMatches: TextHistoryAppointmentSearchMatch[];
  totalMatches: number;
};

type MatchRange = {
  start: number;
  end: number;
};

export function normalizeTextHistorySearchText(value: string) {
  return stripDiacritics(value).toLocaleLowerCase("es-MX").trim();
}

export function textHistoryValueMatches(value: string, query: string) {
  return countTextHistoryMatches(value, query) > 0;
}

export function countTextHistoryMatches(value: string, query: string) {
  return getTextHistoryMatchRanges(value, query).length;
}

export function getTextHistoryHighlightSegments(
  value: string,
  query: string,
): TextHistoryHighlightSegment[] {
  const ranges = getTextHistoryMatchRanges(value, query);

  if (ranges.length === 0) {
    return value ? [{ text: value, highlighted: false }] : [];
  }

  const segments: TextHistoryHighlightSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({
        text: value.slice(cursor, range.start),
        highlighted: false,
      });
    }

    segments.push({
      text: value.slice(range.start, range.end),
      highlighted: true,
    });
    cursor = range.end;
  }

  if (cursor < value.length) {
    segments.push({ text: value.slice(cursor), highlighted: false });
  }

  return segments;
}

export function getTextHistorySearchSummary(
  history: ParsedTextHistory,
  query: string,
): TextHistorySearchSummary {
  const normalizedQuery = normalizeTextHistorySearchText(query);

  if (!normalizedQuery) {
    return {
      query: normalizedQuery,
      hasQuery: false,
      informationMatches: 0,
      appointmentMatches: [],
      totalMatches: 0,
    };
  }

  const informationMatches = countTextHistoryMatches(
    history.information,
    normalizedQuery,
  );
  const appointmentMatches = history.appointments
    .map((appointment, index) =>
      getAppointmentSearchMatch(appointment, index, normalizedQuery),
    )
    .filter((match) => match.totalMatches > 0);
  const totalMatches =
    informationMatches +
    appointmentMatches.reduce((total, match) => total + match.totalMatches, 0);

  return {
    query: normalizedQuery,
    hasQuery: true,
    informationMatches,
    appointmentMatches,
    totalMatches,
  };
}

function getAppointmentSearchMatch(
  appointment: ParsedTextHistoryAppointment,
  index: number,
  query: string,
): TextHistoryAppointmentSearchMatch {
  const dateMatches = countTextHistoryMatches(appointment.dateText, query);
  const normalizedDateMatches = countTextHistoryMatches(
    appointment.normalizedDate ?? "",
    query,
  );
  const bodyMatches = countTextHistoryMatches(appointment.body, query);
  const nextMatches = countTextHistoryMatches(appointment.next, query);

  return {
    index,
    dateMatches,
    normalizedDateMatches,
    bodyMatches,
    nextMatches,
    totalMatches:
      dateMatches + normalizedDateMatches + bodyMatches + nextMatches,
  };
}

function getTextHistoryMatchRanges(value: string, query: string): MatchRange[] {
  const normalizedQuery = normalizeTextHistorySearchText(query);
  if (!normalizedQuery) return [];

  const mappedValue = buildNormalizedIndexMap(value);
  const ranges: MatchRange[] = [];
  let searchFrom = 0;

  while (searchFrom < mappedValue.normalized.length) {
    const matchIndex = mappedValue.normalized.indexOf(
      normalizedQuery,
      searchFrom,
    );
    if (matchIndex < 0) break;

    const matchEndIndex = matchIndex + normalizedQuery.length - 1;
    const start = mappedValue.sourceStarts[matchIndex];
    const end = mappedValue.sourceEnds[matchEndIndex];

    if (start !== undefined && end !== undefined) {
      ranges.push({ start, end });
    }

    searchFrom = matchIndex + normalizedQuery.length;
  }

  return ranges;
}

function buildNormalizedIndexMap(value: string) {
  let normalized = "";
  const sourceStarts: number[] = [];
  const sourceEnds: number[] = [];
  let sourceIndex = 0;

  for (const character of value) {
    const sourceStart = sourceIndex;
    const sourceEnd = sourceStart + character.length;
    const normalizedCharacter =
      stripDiacritics(character).toLocaleLowerCase("es-MX");

    for (const normalizedPiece of normalizedCharacter) {
      normalized += normalizedPiece;
      sourceStarts.push(sourceStart);
      sourceEnds.push(sourceEnd);
    }

    sourceIndex = sourceEnd;
  }

  return { normalized, sourceStarts, sourceEnds };
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
