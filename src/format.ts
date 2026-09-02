const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const WEEKDAYS_LONG = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;
const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

export function formatHistoryDate(iso: string): string {
  const date = new Date(iso);
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()}`;
}

export function formatCompletedLong(iso: string): string {
  const date = new Date(iso);
  return `${WEEKDAYS_LONG[date.getDay()]} ${date.getDate()}`;
}

export function formatTodayHeader(now = new Date()): string {
  return `${WEEKDAYS_LONG[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}
