// Daylight's schedule model: pure decisions, no QML and no I/O.
//
// evaluate() takes the settings (as returned by Config.pluginSettings), the
// location, the clock time and the scheduler's saved state, and says which
// period is current, when the next switch is, and whether to apply a theme.
// Wall-clock times use the process's local time zone, so daylight-saving
// changes follow the system clock.
//
// Sun mode calculates sunrise and sunset locally (NOAA algorithm); with no
// location it falls back to the fixed times and reports `fallback`.
.import "Util.js" as Util

function minutesOfDay(hhmm) {
  var t = Util.parseTime(hhmm)
  return t.hour * 60 + t.minute
}

// Epoch ms of local `minutes` after midnight on the local day `dayOffset` days
// from the day of `now`. A time inside a skipped DST hour lands just after it.
function localTime(now, dayOffset, minutes) {
  var d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset,
    Math.floor(minutes / 60), minutes % 60, 0, 0).getTime()
}

var ZENITH = 90.833

function rad(d) { return d * Math.PI / 180 }
function deg(r) { return r * 180 / Math.PI }

// NOAA solar position at `minutesUtc` after 00:00 UTC of the day starting at
// `midnight` (epoch ms): declination (degrees) and equation of time (minutes).
function solarPosition(midnight, minutesUtc) {
  var jd = midnight / 86400000 + 2440587.5 + minutesUtc / 1440
  var t = (jd - 2451545) / 36525
  var l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
  var mean = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  var ecc = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  var c = Math.sin(rad(mean)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(rad(2 * mean)) * (0.019993 - 0.000101 * t) +
    Math.sin(rad(3 * mean)) * 0.000289
  var omega = 125.04 - 1934.136 * t
  var lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(rad(omega))
  var obliq0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  var obliq = obliq0 + 0.00256 * Math.cos(rad(omega))
  var decl = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(lambda))))
  var y = Math.pow(Math.tan(rad(obliq / 2)), 2)
  var eqTime = 4 * deg(y * Math.sin(2 * rad(l0)) - 2 * ecc * Math.sin(rad(mean)) +
    4 * ecc * y * Math.sin(rad(mean)) * Math.cos(2 * rad(l0)) -
    0.5 * y * y * Math.sin(4 * rad(l0)) - 1.25 * ecc * ecc * Math.sin(2 * rad(mean)))
  return { decl: decl, eqTime: eqTime }
}

// Sunrise or sunset for the civil date y-m-d (month 0-11) at lat/lon, in epoch
// ms, or "polarDay" / "polarNight" when the sun never sets / rises.
function sunEvent(lat, lon, y, m, d, rising) {
  var midnight = Date.UTC(y, m, d)
  var minutes = 720 - 4 * lon
  for (var pass = 0; pass < 2; pass++) {
    var p = solarPosition(midnight, minutes)
    var cosHa = Math.cos(rad(ZENITH)) / (Math.cos(rad(lat)) * Math.cos(rad(p.decl))) -
      Math.tan(rad(lat)) * Math.tan(rad(p.decl))
    if (cosHa > 1) return "polarNight"
    if (cosHa < -1) return "polarDay"
    var ha = deg(Math.acos(cosHa))
    minutes = 720 - 4 * (lon + (rising ? ha : -ha)) - p.eqTime
  }
  return midnight + Math.round(minutes * 60000)
}

function validLocation(loc) {
  return !!loc && typeof loc.latitude === "number" && typeof loc.longitude === "number" &&
    isFinite(loc.latitude) && isFinite(loc.longitude)
}

// Sun times for the local day `dayOffset` days from the day of `now`.
function sunForDay(loc, now, dayOffset) {
  var d = new Date(now)
  var day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset)
  var y = day.getFullYear(), m = day.getMonth(), n = day.getDate()
  var rise = sunEvent(loc.latitude, loc.longitude, y, m, n, true)
  if (typeof rise === "string") return { state: rise, sunrise: null, sunset: null }
  return { state: "normal", sunrise: rise, sunset: sunEvent(loc.latitude, loc.longitude, y, m, n, false) }
}

// True when `list` holds a boundary after `now` that differs from the period at `now`.
function periodChangesAfter(list, now) {
  var sorted = list.slice().sort(function (a, b) { return a.at - b.at })
  var period = sorted[0].period
  for (var i = 0; i < sorted.length && sorted[i].at <= now; i++) period = sorted[i].period
  for (var j = 0; j < sorted.length; j++) {
    if (sorted[j].at > now && sorted[j].period !== period) return true
  }
  return false
}

// Switch boundaries from yesterday to the day after tomorrow, in order.
// Consecutive boundaries of the same period collapse into the first, so a
// polar day or night adds a boundary only where the period actually changes.
function boundaries(settings, now, location) {
  var useSun = settings.mode === "sun" && validLocation(location)
  var light = minutesOfDay(settings.lightTime)
  var dark = minutesOfDay(settings.darkTime)
  var out = []
  // A polar day or night can last months: keep looking until a period changes.
  var hasNext = false
  for (var day = -1; day <= 2 || (!hasNext && day <= 400); day++) {
    if (useSun) {
      var sun = sunForDay(location, now, day)
      if (sun.state === "normal") {
        out.push({ at: sun.sunrise + (settings.sunriseOffsetMinutes || 0) * 60000, period: "light" })
        out.push({ at: sun.sunset + (settings.sunsetOffsetMinutes || 0) * 60000, period: "dark" })
      } else {
        out.push({ at: localTime(now, day, 0), period: sun.state === "polarDay" ? "light" : "dark" })
      }
    } else {
      out.push({ at: localTime(now, day, light), period: "light" })
      if (dark !== light) out.push({ at: localTime(now, day, dark), period: "dark" })
    }
    if (day >= 2) hasNext = periodChangesAfter(out, now)
  }
  out.sort(function (a, b) { return a.at - b.at })
  var merged = []
  for (var i = 0; i < out.length; i++) {
    if (merged.length === 0 || merged[merged.length - 1].period !== out[i].period) merged.push(out[i])
  }
  return merged
}

// True when the wall clock moved more than twice `intervalMs` (or backwards)
// since the last heartbeat `lastBeat`. QML timers pause while the machine
// sleeps, so a gap this large means a resume or a clock jump.
function resumedAfterGap(lastBeat, now, intervalMs) {
  if (typeof lastBeat !== "number") return false
  return now < lastBeat || now - lastBeat > 2 * intervalMs
}

function evaluate(input) {
  var settings = input.settings
  var now = input.now
  var all = boundaries(settings, now, input.location)

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
    record: false,
    fallback: null,
    sun: null
  }

  if (settings.mode === "sun") {
    if (validLocation(input.location)) {
      var today = sunForDay(input.location, now, 0)
      result.sun = { state: today.state, sunrise: today.sunrise, sunset: today.sunset }
    } else {
      result.fallback = "noLocation"
    }
  }

  var state = input.state
  var hasState = !!state && typeof state.lastBoundary === "number"

  // Only the passing of time crosses a boundary: `now` reaching the switch time
  // the scheduler saw last. A settings or location edit moves boundaries
  // without time passing, so it re-anchors the saved state to the current
  // boundary and applies nothing. Old state without a next time compares
  // boundaries instead.
  if (hasState) {
    var crossed = typeof state.nextAt === "number" ? now >= state.nextAt : state.lastBoundary < current.at
    if (!crossed) {
      result.record = state.lastBoundary !== current.at ||
        (typeof state.nextAt === "number" && state.nextAt !== next.at)
      return result
    }
  }

  // Paused: cross the boundary without applying, so unpausing mid-period does
  // not re-apply the current period's theme.
  if (settings.paused) {
    result.record = true
    return result
  }

  var target = current.period === "light" ? settings.lightTheme : settings.darkTheme
  if (!hasState && !(settings.lightTheme && settings.darkTheme)) return result

  result.record = true
  if (!target) return result

  var slug = Util.slug(target)
  if (slug === Util.slug(input.currentTheme)) return result

  // `omarchy theme list` failed or came back empty: the installed themes are
  // unknown, so skip without a notification or a record and retry next time.
  var installed = input.installedThemes
  if (!Array.isArray(installed) || installed.length === 0) {
    result.record = false
    return result
  }
  if (installed.map(function (n) { return Util.slug(n) }).indexOf(slug) < 0) {
    result.missing = target
    return result
  }

  result.apply = slug
  return result
}
