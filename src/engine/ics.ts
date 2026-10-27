import type { Settings } from '../domain/types'

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function compact(date: string) {
  return date.replace(/-/g, '')
}

function escapeText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/**
 * A calendar file with a recurring study block on the chosen days (with an alert at
 * start time) and an all-day exam-date marker. Times are "floating" local times, which
 * Apple Calendar and Google Calendar interpret in the device's current time zone.
 * This is a reliable reminder fallback that needs no server.
 */
export function buildStudyCalendarIcs(settings: Settings, startDate: string, appUrl: string, now = new Date()): string {
  const [hh, mm] = settings.studyTime.split(':').map(Number)
  const endMinutes = hh * 60 + mm + settings.stageMinutes.recall + settings.stageMinutes.learn + settings.stageMinutes.practice
  const endH = Math.floor(endMinutes / 60) % 24
  const endM = endMinutes % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const byDay = settings.studyDays.map((d) => DAY_CODES[d]).join(',')
  // First occurrence must fall on a study day; RRULE expands from DTSTART.
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BA Exam Coach//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:ba-coach-study-${compact(startDate)}@ba-exam-coach`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${compact(startDate)}T${pad(hh)}${pad(mm)}00`,
    `DTEND:${compact(startDate)}T${pad(endH)}${pad(endM)}00`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${compact(settings.targetDate)}T235959`,
    `SUMMARY:${escapeText('BA exam study session (60 min)')}`,
    `DESCRIPTION:${escapeText(`Open BA Exam Coach and tap Start Session: ${appUrl}/session`)}`,
    `URL:${appUrl}/session`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText('Time for tonight’s BA study session')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `UID:ba-coach-exam-${compact(settings.targetDate)}@ba-exam-coach`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(settings.targetDate)}`,
    `SUMMARY:${escapeText('Target: Salesforce BA exam (only if readiness is demonstrated)')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
