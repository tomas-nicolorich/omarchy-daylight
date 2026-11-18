// Daylight's schedule model: pure decisions, no QML and no I/O.
//
// evaluate() takes the settings (as returned by Config.pluginSettings), the
// location, the clock time and the scheduler's saved state, and says which
// period is current, when the next switch is, and whether to apply a theme.
// Wall-clock times use the process's local time zone, so daylight-saving
// changes follow the system clock.
//
// Until sun mode lands, "sun" mode uses the fixed times.

// A theme name in the form `omarchy theme set` and theme.name use.
function themeSlug(name) {
  return String(name === undefined || name === null ? "" : name)
    .replace(/<[^>]+>/g, "")
    .trim()
    .toLowerCase()
    .replace(/ /g, "-")
}

function minutesOfDay(hhmm) {
  var parts = String(hhmm).split(":")
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
}

// Epoch ms of local `minutes` after midnight on the local day `dayOffset` days
// from the day of `now`. A time inside a skipped DST hour lands just after it.
function localTime(now, dayOffset, minutes) {
  var d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset,
    Math.floor(minutes / 60), minutes % 60, 0, 0).getTime()
}

// Switch boundaries from yesterday to the day after tomorrow, in order.
function boundaries(settings, now) {
  var light = minutesOfDay(settings.lightTime)
  var dark = minutesOfDay(settings.darkTime)
  var out = []
  for (var day = -1; day <= 2; day++) {
    out.push({ at: localTime(now, day, light), period: "light" })
    if (dark !== light) out.push({ at: localTime(now, day, dark), period: "dark" })
  }
  out.sort(function (a, b) { return a.at - b.at })
  return out
}

function evaluate(input) {
  var settings = input.settings
  var now = input.now
  var all = boundaries(settings, now)

  var current = all[0]
  var next = null
  for (var i = 0; i < all.length; i++) {
    if (all[i].at <= now) current = all[i]
    else { next = all[i]; break }
  }

  var result = {
    period: current.period,
    boundary: current.at,
    next: { at: next.at, period: next.period },
    apply: null,
    missing: null,
    record: false
  }

  if (settings.paused) return result

  var state = input.state
  var hasState = !!state && typeof state.lastBoundary === "number"
  if (hasState && state.lastBoundary >= current.at) return result

  var target = current.period === "light" ? settings.lightTheme : settings.darkTheme
  if (!hasState && !(settings.lightTheme && settings.darkTheme)) return result

  result.record = true
  if (!target) return result

  var slug = themeSlug(target)
  if (slug === themeSlug(input.currentTheme)) return result

  var installed = input.installedThemes
  if (installed && installed.map(themeSlug).indexOf(slug) < 0) {
    result.missing = target
    return result
  }

  result.apply = slug
  return result
}
