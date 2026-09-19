export type PatientSearchRecord = {
  fullName: string;
  phone: string | null;
};

export type PatientGenderValue = "MASCULINO" | "FEMENINO";
export type PatientGenderFilter = "ALL" | PatientGenderValue;
export type PatientSortOrder = "asc" | "desc";

export type PatientDirectoryRecord = PatientSearchRecord & {
  gender: PatientGenderValue | null;
  nextAppointmentDate: string | null;
  balanceCents: number;
};

export type PatientDirectoryFilters = {
  query: string;
  genderFilter: PatientGenderFilter;
  debtorsOnly: boolean;
  appointmentDate: string;
  sortOrder: PatientSortOrder;
};

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizePhoneSearch(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function patientMatchesQuery(patient: PatientSearchRecord, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const phoneQuery = normalizePhoneSearch(query);

  if (!normalizedQuery && !phoneQuery) return true;

  const normalizedName = normalizeSearchText(patient.fullName);
  const normalizedPhone = normalizePhoneSearch(patient.phone);

  return (
    (!!normalizedQuery && normalizedName.includes(normalizedQuery)) ||
    (!!phoneQuery && normalizedPhone.includes(phoneQuery))
  );
}

export function filterPatientsByQuery<T extends PatientSearchRecord>(patients: T[], query: string) {
  return patients.filter((patient) => patientMatchesQuery(patient, query));
}

export function getPatientSuggestions<T extends PatientSearchRecord>(
  patients: T[],
  query: string,
  limit = 6
) {
  if (!query.trim()) return [];

  return filterPatientsByQuery(patients, query).slice(0, limit);
}

export function toDateFilterValue(value: Date | string | null | undefined) {
  if (!value) return "";

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}

export function sortPatientsByName<T extends PatientSearchRecord>(patients: T[], order: PatientSortOrder) {
  const direction = order === "asc" ? 1 : -1;

  return [...patients].sort((left, right) => {
    const normalizedComparison = normalizeSearchText(left.fullName).localeCompare(
      normalizeSearchText(right.fullName),
      "es"
    );

    if (normalizedComparison !== 0) {
      return normalizedComparison * direction;
    }

    return left.fullName.localeCompare(right.fullName, "es") * direction;
  });
}

export function filterPatientDirectory<T extends PatientDirectoryRecord>(
  patients: T[],
  filters: PatientDirectoryFilters
) {
  let matches = filterPatientsByQuery(patients, filters.query);

  if (filters.genderFilter !== "ALL") {
    matches = matches.filter((patient) => patient.gender === filters.genderFilter);
  }

  if (filters.debtorsOnly) {
    matches = matches.filter((patient) => patient.balanceCents > 0);
  }

  if (filters.appointmentDate) {
    matches = matches.filter(
      (patient) => toDateFilterValue(patient.nextAppointmentDate) === filters.appointmentDate
    );
  }

  return sortPatientsByName(matches, filters.sortOrder);
}
