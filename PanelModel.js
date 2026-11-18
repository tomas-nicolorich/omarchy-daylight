// What the bar widget and panel show, as pure functions (no QML, no I/O).
.import "Util.js" as Util

// The panel's keyboard cursor rows, top to bottom. The light and dark "edge"
// rows are the sunrise and sunset offsets in sun mode and the light and dark
// times in fixed mode. The refresh row exists only when the location comes
// from the geo lookup.
var ROW = {
  lightTheme: 0,
  darkTheme: 1,
  mode: 2,
  lightEdge: 3,
  darkEdge: 4,
  refreshLocation: 5,
  switchNow: 6,
  pause: 7
}

// The row one step up (dy < 0) or down from `row`, skipping rows that are not
// shown and stopping at the ends.
function moveRow(row, dy, refreshVisible) {
  var step = dy > 0 ? 1 : -1
  var next = row + step
  if (next === ROW.refreshLocation && !refreshVisible) next += step
  return Math.max(ROW.lightTheme, Math.min(ROW.pause, next))
}

// The display name ("Catppuccin Latte") of a saved theme slug, from the
// installed names. A theme that is not installed shows as saved.
function displayName(installed, saved) {
  var list = Array.isArray(installed) ? installed : []
  for (var i = 0; i < list.length; i++) {
    if (saved && Util.slug(list[i]) === Util.slug(saved)) return Util.plainText(list[i])
  }
  return Util.plainText(saved)
}

// Whether the panel shows Refresh location: only in sun mode, and only when
// the location comes from the geo lookup.
function refreshVisible(settings, canRefresh) {
  return !!canRefresh && !!settings && settings.mode === "sun"
}

// Dropdown options for a theme picker. Values are slugs (what is saved and
// compared), labels the display names. A saved theme that is not installed
// stays in the list (first) so the picker shows what is saved.
function themeOptions(installed, saved) {
  var out = []
  var list = Array.isArray(installed) ? installed : []
  var found = false
  for (var i = 0; i < list.length; i++) {
    if (saved && Util.slug(list[i]) === Util.slug(saved)) found = true
    out.push({ value: Util.slug(list[i]), label: Util.plainText(list[i]) })
  }
  if (saved && !found) out.unshift({ value: saved, label: Util.plainText(saved) })
  return out
}

// True until both themes are chosen.
function needsThemes(settings) {
  return !(settings && settings.lightTheme && settings.darkTheme)
}

// `result` is Schedule.evaluate's output.
// `installed` (optional) turns the next theme's slug into its display name.
function summary(result, settings, installed) {
  var next = result.next.period
  var saved = (next === "light" ? settings.lightTheme : settings.darkTheme) || ""
  return {
    period: result.period,
    nextAt: result.next.at,
    nextPeriod: next,
    nextTheme: displayName(installed, saved)
  }
}

// Theme slug "Switch now" applies: the other period's theme, or null when it
// is unset or not installed.
function switchTarget(period, settings, installed) {
  var other = period === "light" ? settings.darkTheme : settings.lightTheme
  if (!other) return null
  var list = Array.isArray(installed) ? installed : []
  for (var i = 0; i < list.length; i++) {
    if (Util.slug(list[i]) === Util.slug(other)) return Util.slug(other)
  }
  return null
}

// Replace the hour or minute of an "HH:MM" time.
function withTimePart(time, part, value) {
  var t = Util.parseTime(time) || { hour: 0, minute: 0 }
  if (part === "hour") t.hour = value
  else t.minute = value
  return Util.formatTime(t.hour, t.minute)
}

// The hour or minute of an "HH:MM" time, for a number field.
function timePart(time, part) {
  var t = Util.parseTime(time) || { hour: 0, minute: 0 }
  return part === "hour" ? t.hour : t.minute
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
