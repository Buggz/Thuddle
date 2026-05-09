// RFC 5545 ICS generation — pure client-side, no dependencies.
// Order and method, mon ami: every byte respected.

const CRLF = '\r\n'
const PROD_ID_DEFAULT = '-//Thuddle//Add to Calendar//EN'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatUtc(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date passed to ICS formatter')
  }
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    'Z'
  )
}

const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
}

function stripHtml(input) {
  if (!input) return ''
  let out = String(input).replace(/<[^>]+>/g, '')
  out = out.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, m => ENTITY_MAP[m] ?? m)
  return out.replace(/\s+/g, ' ').trim()
}

function escapeIcsText(input) {
  if (input == null) return ''
  return String(input)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Fold lines longer than 75 octets per RFC 5545 §3.1
function foldLine(line) {
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null
  const byteLength = (s) => (encoder ? encoder.encode(s).length : s.length)
  if (byteLength(line) <= 75) return line

  const out = []
  let current = ''
  for (const ch of line) {
    if (byteLength(current + ch) > 75) {
      out.push(current)
      current = ' ' + ch // continuation lines start with a single space
    } else {
      current += ch
    }
  }
  if (current) out.push(current)
  return out.join(CRLF)
}

function joinLines(lines) {
  return lines.filter(Boolean).map(foldLine).join(CRLF) + CRLF
}

export function buildEventIcs({ uid, title, description, location, start, end, prodId } = {}) {
  if (!uid) throw new Error('buildEventIcs: uid is required')
  if (!title) throw new Error('buildEventIcs: title is required')
  if (!start) throw new Error('buildEventIcs: start is required')

  const startDate = new Date(start)
  const endDate = end
    ? new Date(end)
    : new Date(startDate.getTime() + 60 * 60 * 1000)

  const dtStart = formatUtc(startDate)
  const dtEnd = formatUtc(endDate)
  const dtStamp = formatUtc(new Date())

  const cleanDescription = stripHtml(description)
  const cleanLocation = location ? String(location).trim() : ''

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:' + (prodId || PROD_ID_DEFAULT),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTAMP:' + dtStamp,
    'DTSTART:' + dtStart,
    'DTEND:' + dtEnd,
    'SUMMARY:' + escapeIcsText(title),
    cleanDescription ? 'DESCRIPTION:' + escapeIcsText(cleanDescription) : null,
    cleanLocation ? 'LOCATION:' + escapeIcsText(cleanLocation) : null,
    'END:VEVENT',
    'END:VCALENDAR'
  ]

  return joinLines(lines)
}

export function downloadIcs(filename, icsContent) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
