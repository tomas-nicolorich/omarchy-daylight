// The bar background per period: Daylight remembers the background you pick
// (double-clicking the bar cycles clear, glassy and opaque) while the light or
// the dark theme is on, and restores it when that theme comes back.
//
// Pure: Service.qml passes in shell.json, the current theme and the saved
// backgrounds, and carries out the result.

.import "Util.js" as Util

var BACKGROUNDS = ["none", "glassy", "opaque"]

// The bar background shell.json holds, read the way `omarchy bar background`
// reads it: a config from before `background` says `transparent` instead.
function backgroundOf(shellJson) {
  var bar = shellJson && typeof shellJson === "object" ? shellJson.bar : null
  if (!bar || typeof bar !== "object") return "opaque"
  if (BACKGROUNDS.indexOf(bar.background) >= 0) return bar.background
  return bar.transparent === true ? "none" : "opaque"
}

// "light" or "dark" for one of the chosen themes, otherwise null. With the
// same theme chosen for both periods there is nothing to tell apart.
function periodOf(theme, settings) {
  var current = Util.slug(theme)
  var light = settings && settings.lightTheme ? Util.slug(settings.lightTheme) : ""
  var dark = settings && settings.darkTheme ? Util.slug(settings.darkTheme) : ""
  if (!current || light === dark) return null
  if (current === light) return "light"
  if (current === dark) return "dark"
  return null
}

// What to do after the theme or the bar background changes.
//
// input: { period, themeChanged, background, saved }
//   period        periodOf the current theme
//   themeChanged  true when the theme just changed, false when the background did
//   background    the bar background now
//   saved         { light, dark } backgrounds remembered so far
//
// Returns { saved, changed, apply }: the backgrounds to keep, whether they
// differ from the input, and the background to set on the bar (or null).
// A new theme gets its period's remembered background; a period with none yet
// remembers the current one. Otherwise the current background is remembered.
function reconcile(input) {
  var saved = {}
  var given = input.saved && typeof input.saved === "object" ? input.saved : {}
  for (var k in given) saved[k] = given[k]
  var result = { saved: saved, changed: false, apply: null }
  var period = input.period
  if (period !== "light" && period !== "dark") return result

  var remembered = BACKGROUNDS.indexOf(saved[period]) >= 0 ? saved[period] : null
  if (input.themeChanged && remembered) {
    if (remembered !== input.background) result.apply = remembered
    return result
  }
  if (remembered !== input.background) {
    saved[period] = input.background
    result.changed = true
  }
  return result
}
