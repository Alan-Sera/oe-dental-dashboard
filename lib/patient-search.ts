export type PatientSearchRecord = {
  fullName: string;
  phone: string | null;
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
