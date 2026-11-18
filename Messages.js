// The text Daylight sends to sinks that may render rich text (the bar tooltip
// and desktop notifications), as pure functions: no QML and no I/O.
//
// `t(key, fallback)` is the translator (the plugin's `strings.t`). Dynamic
// text passes through Util.plainText first, because those sinks belong to
// Omarchy and this plugin cannot set them to Text.PlainText.
.import "Util.js" as Util

// Replace %1, %2, ... with `args` in one pass, so an argument containing "%2"
// stays literal.
function fill(template, args) {
  return String(template).replace(/%(\d+)/g, function (whole, n) {
    var i = parseInt(n, 10) - 1
    return i >= 0 && i < args.length ? String(args[i]) : whole
  })
}

// The bar icon's tooltip. `summary` is PanelModel.summary's output and
// `nextTime` the next switch time already formatted for the locale.
function tooltip(settings, summary, nextTime, t) {
  if (!(settings && settings.lightTheme && settings.darkTheme))
    return t("widget.tooltip.chooseThemes", "Open Daylight to choose your light and dark themes")
  if (settings.paused) return t("widget.tooltip.paused", "Switching is paused")
  return fill(t("widget.tooltip.next", "Switching to %1 at %2"), [Util.plainText(summary.nextTheme), nextTime])
}

// The panel's line under the period title.
function nextSwitch(settings, summary, nextTime, t) {
  if (!(settings && settings.lightTheme && settings.darkTheme))
    return t("panel.chooseThemes", "Choose a light and a dark theme to start switching.")
  return fill(t("panel.next", "Next switch: %1 at %2"), [Util.plainText(summary.nextTheme), nextTime])
}

function missingThemeNotification(name, t) {
  return fill(t("notification.missingTheme", "Theme \"%1\" is not installed, so Daylight skipped the switch."),
    [Util.plainText(name)])
}
