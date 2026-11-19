const CLINIC_TZ = 'Asia/Colombo';

export function clinicTodayIso(timeZone = CLINIC_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfWeekIso(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = d.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function formatSessionDate(isoDate: string, timeZone = CLINIC_TZ): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatSessionTime(
  startAt: string,
  endAt: string,
  timeZone = CLINIC_TZ,
): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  const start = new Date(startAt).toLocaleTimeString('en-US', opts);
  const end = new Date(endAt).toLocaleTimeString('en-US', opts);
  return `${start} – ${end}`;
}

export function formatSessionDuration(startAt: string, endAt: string): string {
  const ms = new Date(endAt).getTime() - new Date(startAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

export function weekDates(weekStartIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStartIso, i));
}
