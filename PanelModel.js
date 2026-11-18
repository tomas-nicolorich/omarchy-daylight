// What the bar widget and panel show, as pure functions (no QML, no I/O).

// Strip markup so a theme name is safe in components whose inner Text this
// plugin cannot set to PlainText (dropdown rows, tooltips, notifications).
function plainText(s) {
  return String(s === undefined || s === null ? "" : s).replace(/<[^>]+>/g, "").trim()
}

function slug(s) {
  return plainText(s).toLowerCase().replace(/ /g, "-")
}

// Dropdown options for a theme picker. A saved theme that is not installed
// stays in the list (first) so the picker shows what is saved.
function themeOptions(installed, saved) {
  var out = []
  var list = Array.isArray(installed) ? installed : []
  var found = false
  for (var i = 0; i < list.length; i++) {
    if (saved && slug(list[i]) === slug(saved)) found = true
    out.push({ value: list[i], label: plainText(list[i]) })
  }
  if (saved && !found) out.unshift({ value: saved, label: plainText(saved) })
  return out
}

// True until both themes are chosen.
function needsThemes(settings) {
  return !(settings && settings.lightTheme && settings.darkTheme)
}

// `result` is Schedule.evaluate's output.
function summary(result, settings) {
  var next = result.next.period
  return {
    period: result.period,
    nextAt: result.next.at,
    nextPeriod: next,
    nextTheme: (next === "light" ? settings.lightTheme : settings.darkTheme) || ""
  }
}

// Theme slug "Switch now" applies: the other period's theme, or null when it
// is unset or not installed.
function switchTarget(period, settings, installed) {
  var other = period === "light" ? settings.darkTheme : settings.lightTheme
  if (!other) return null
  var list = Array.isArray(installed) ? installed : []
  for (var i = 0; i < list.length; i++) {
    if (slug(list[i]) === slug(other)) return slug(other)
  }
  return null
}

// Replace the hour or minute of an "HH:MM" time.
function withTimePart(time, part, value) {
  var p = String(time).split(":")
  var h = parseInt(p[0], 10)
  var m = parseInt(p[1], 10)
  if (part === "hour") h = value
  else m = value
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m
}

// ---- Mode section: sun or fixed times ----

// What the mode section shows. `result` is Schedule.evaluate's output. In sun
// mode with no location the fixed times are in use, so the panel shows them
// together with a notice.
function modeView(result, settings) {
  var sun = result.sun
  var noLocation = result.fallback === "noLocation"
  var sunMode = settings.mode === "sun" && !noLocation
  return {
    mode: settings.mode,
    showOffsets: sunMode,
    showTimes: !sunMode,
    noLocation: noLocation,
    sunState: sun ? sun.state : null,
    sunrise: sun ? sun.sunrise : null,
    sunset: sun ? sun.sunset : null
  }
}
