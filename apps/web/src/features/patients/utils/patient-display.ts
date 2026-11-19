export function displayPatientAge(input: {
  dateOfBirth: string | null;
  approximateAgeYears: number | null;
  ageRecordedOn: string | null;
}): string {
  if (input.dateOfBirth) {
    const dob = new Date(`${input.dateOfBirth}T12:00:00`);
    if (Number.isNaN(dob.getTime())) return '—';
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
    return `${age} yrs (DOB ${input.dateOfBirth})`;
  }
  if (input.approximateAgeYears != null) {
    const recorded = input.ageRecordedOn ? ` · recorded ${input.ageRecordedOn}` : '';
    return `~${input.approximateAgeYears} yrs${recorded}`;
  }
  return '—';
}

export function formatRegisteredDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
