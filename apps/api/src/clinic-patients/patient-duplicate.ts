export type DuplicateMatch = {
  id: string;
  patientNumber: string;
  fullName: string;
  dateOfBirth: string | null;
  approximateAgeYears: number | null;
  primaryContactMasked: string | null;
  status: string;
  sharedPhone: boolean;
  nameMatch: boolean;
  dobMatch: boolean;
  ageHintMatch: boolean;
  strength: 'STRONG' | 'SHARED_PHONE' | 'WEAK';
  reasons: string[];
};

export function normalizePersonName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en');
}

export function namesLikelyEqual(a: string, b: string): boolean {
  return normalizePersonName(a) === normalizePersonName(b);
}

/**
 * Score duplicate candidates.
 * Phone alone is never proof of identity duplication (family sharing).
 */
export function scoreDuplicateCandidate(input: {
  incomingName: string;
  incomingDob?: string | null;
  incomingAge?: number | null;
  candidate: {
    id: string;
    patientNumber: string;
    fullName: string;
    dateOfBirth: string | null;
    approximateAgeYears: number | null;
    primaryContactMasked: string | null;
    status: string;
    sharedPhone: boolean;
  };
}): DuplicateMatch | null {
  const nameMatch = namesLikelyEqual(input.incomingName, input.candidate.fullName);
  const dobMatch = Boolean(
    input.incomingDob &&
      input.candidate.dateOfBirth &&
      input.incomingDob === input.candidate.dateOfBirth,
  );
  const ageHintMatch = Boolean(
    input.incomingAge != null &&
      input.candidate.approximateAgeYears != null &&
      Math.abs(input.incomingAge - input.candidate.approximateAgeYears) <= 1,
  );

  const reasons: string[] = [];
  if (nameMatch) reasons.push('Same name');
  if (dobMatch) reasons.push('Same date of birth');
  if (ageHintMatch) reasons.push('Similar approximate age');
  if (input.candidate.sharedPhone) reasons.push('Shared phone number');

  let strength: DuplicateMatch['strength'] | null = null;

  // Strong: same person signals (name + phone, or name + DOB)
  if (nameMatch && input.candidate.sharedPhone) strength = 'STRONG';
  else if (nameMatch && dobMatch) strength = 'STRONG';
  // Family shared phone with different name
  else if (input.candidate.sharedPhone && !nameMatch) strength = 'SHARED_PHONE';
  // Weak name + age hint without phone/DOB certainty
  else if (nameMatch && ageHintMatch) strength = 'WEAK';
  else if (nameMatch) strength = 'WEAK';

  if (!strength) return null;

  return {
    id: input.candidate.id,
    patientNumber: input.candidate.patientNumber,
    fullName: input.candidate.fullName,
    dateOfBirth: input.candidate.dateOfBirth,
    approximateAgeYears: input.candidate.approximateAgeYears,
    primaryContactMasked: input.candidate.primaryContactMasked,
    status: input.candidate.status,
    sharedPhone: input.candidate.sharedPhone,
    nameMatch,
    dobMatch,
    ageHintMatch,
    strength,
    reasons,
  };
}
