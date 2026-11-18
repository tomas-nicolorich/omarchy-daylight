// Helpers Daylight's other modules share: pure, no QML and no I/O.
.pragma library

// Strip markup so untrusted text (a theme name, a location name) is safe in
// components whose inner Text this plugin cannot set to PlainText (dropdown
// rows, tooltips, notifications).
function plainText(s) {
  return String(s === undefined || s === null ? "" : s).replace(/<[^>]+>/g, "").trim()
}

// A theme name in the form `omarchy theme set` and theme.name use.
function slug(s) {
  return plainText(s).toLowerCase().replace(/ /g, "-")
}

// The names in `omarchy theme list` output, or null when the output holds none.
// A failed command and a machine with no themes look the same, so callers treat
// null as "installed themes unknown".
function parseThemeList(text) {
  var names = String(text === undefined || text === null ? "" : text).split("\n")
    .map(function (l) { return l.trim() })
    .filter(function (l) { return l !== "" })
  return names.length > 0 ? names : null
}

// "HH:MM" (24 hours) as { hour, minute }, or null when it is not a time.
function parseTime(value) {
  if (typeof value !== "string") return null
  var m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  var hour = parseInt(m[1], 10)
  var minute = parseInt(m[2], 10)
  if (hour > 23 || minute > 59) return null
  return { hour: hour, minute: minute }
}

function formatTime(hour, minute) {
  return (hour < 10 ? "0" : "") + hour + ":" + (minute < 10 ? "0" : "") + minute
}
