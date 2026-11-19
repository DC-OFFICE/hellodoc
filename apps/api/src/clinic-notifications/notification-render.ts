export type TemplateVars = {
  queueDisplay: string;
  sessionDate: string;
  trackingUrl?: string;
  peopleAhead?: string;
  delayHint?: string;
  clinicName?: string;
};

export function renderTemplate(body: string, vars: TemplateVars): string {
  return body
    .replaceAll('{{queueDisplay}}', vars.queueDisplay)
    .replaceAll('{{sessionDate}}', vars.sessionDate)
    .replaceAll('{{trackingUrl}}', vars.trackingUrl ?? '')
    .replaceAll('{{peopleAhead}}', vars.peopleAhead ?? '')
    .replaceAll('{{delayHint}}', vars.delayHint ?? '')
    .replaceAll('{{clinicName}}', vars.clinicName ?? 'Clinic')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function formatQueueDisplay(n: number): string {
  return String(n).padStart(3, '0');
}

export function formatSessionDate(localDate: Date | string, startAt?: Date): string {
  const date =
    localDate instanceof Date
      ? localDate.toISOString().slice(0, 10)
      : String(localDate).slice(0, 10);
  if (!startAt) return date;
  const time = startAt.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Colombo',
  });
  return `${date} ${time}`;
}
