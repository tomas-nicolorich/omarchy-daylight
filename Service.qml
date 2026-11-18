// Daylight's scheduler. Kept loaded, so switching runs with no bar widget.
//
// All decisions come from Schedule.js; this file feeds it inputs (settings,
// saved state, current theme, installed themes, the clock) and carries out the
// result (apply a theme, notify, save state).
//
// The state file lives under ~/.local/state, never inside the plugin
// directory: the shell reloads a plugin on any write there.
import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons as Commons
import "Config.js" as Config
import "Schedule.js" as Schedule
import "Location.js" as Location

Item {
  id: root

  // Injected by omarchy-shell.
  property var shell: null
  property var manifest: null

  readonly property string pluginId: "tomas.daylight"
  readonly property string home: Quickshell.env("HOME")
  readonly property string stateHome: Quickshell.env("XDG_STATE_HOME") || (home + "/.local/state")
  readonly property string stateFile: stateHome + "/omarchy/daylight-state.json"
  readonly property string shellJsonPath: home + "/.config/omarchy/shell.json"
  readonly property string themeNameFile: stateHome + "/omarchy/current/theme.name"
  readonly property string weatherFile: stateHome + "/omarchy/settings/weather.json"
  readonly property int maxIntervalMs: 5 * 60 * 1000

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  property var shellJson: null
  property bool settingsLoaded: false

  function settings() {
    return Config.pluginSettings(root.shellJson, root.pluginId)
  }

  // Read state, current theme and installed themes in one go, then decide.
  function tick() {
    if (!settingsLoaded || probe.running) return
    probe.running = true
  }

  function parseProbe(text) {
    var parts = text.split("\n@@@\n")
    var state = null
    try { state = JSON.parse(parts[0]) } catch (e) { state = null }
    var themes = (parts[3] || "").split("\n").filter(function (l) { return l.trim() !== "" })
    return {
      state: (state && typeof state === "object") ? state : {},
      currentTheme: (parts[1] || "").trim(),
      weather: Location.parseWeatherFile(parts[2] || ""),
      installedThemes: themes
    }
  }

  // Everything Daylight remembers, rewritten whole so the boundary and the
  // cached location never overwrite each other.
  property var savedState: ({})

  function saveState() {
    Quickshell.execDetached(["bash", "-c",
      'mkdir -p "$(dirname "$1")" && printf %s "$2" > "$1.tmp" && mv "$1.tmp" "$1"',
      "bash", root.stateFile, JSON.stringify(root.savedState)])
  }

  function decide(text) {
    var seen = parseProbe(text)
    root.savedState = seen.state

    // Weather location first; otherwise one lookup of Omarchy's geo endpoint,
    // cached in the state file and never repeated while the cache exists.
    var where = Location.resolveLocation(seen.weather, seen.state.location)
    if (where.lookup && !geo.running) geo.running = true

    var result = Schedule.evaluate({
      settings: settings(),
      location: where.location,
      now: Date.now(),
      state: seen.state,
      currentTheme: seen.currentTheme,
      installedThemes: seen.installedThemes
    })

    if (result.apply) {
      Quickshell.execDetached(["bash", "-lc", 'exec "$@"', "bash", "omarchy", "theme", "set", result.apply])
    } else if (result.missing) {
      var name = String(result.missing).replace(/<[^>]+>/g, "")
      Quickshell.execDetached(["bash", "-lc", 'exec "$@"', "bash", "omarchy-notification-send",
        "-u", "normal", "Daylight",
        strings.t("notification.missingTheme", "Theme \"%1\" is not installed, so Daylight skipped the switch.").arg(name)])
    }
    if (result.record) {
      root.savedState.lastBoundary = result.boundary
      saveState()
    }

    var wait = result.next.at - Date.now() + 500
    timer.interval = Math.max(1000, Math.min(root.maxIntervalMs, wait))
    timer.restart()
  }

  // One request to the endpoint Omarchy's own weather widget uses.
  Process {
    id: geo
    command: ["curl", "-fsS", "--max-time", "4", "https://geo.omarchy.org/"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var found = Location.parseGeoResponse(text)
        if (!found) return
        root.savedState.location = found
        root.saveState()
        root.tick()
      }
    }
  }

  Process {
    id: probe
    command: ["bash", "-c",
      'cat "$1" 2>/dev/null; printf "\\n@@@\\n"; cat "$2" 2>/dev/null; printf "\\n@@@\\n"; cat "$3" 2>/dev/null; printf "\\n@@@\\n"; omarchy theme list 2>/dev/null',
      "bash", root.stateFile, root.themeNameFile, root.weatherFile]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.decide(text)
    }
  }

  Timer {
    id: timer
    repeat: false
    onTriggered: root.tick()
  }

  // Re-evaluate when the weather location or the system time zone changes.
  FileView {
    path: root.weatherFile
    watchChanges: true
    printErrors: false
    onFileChanged: root.tick()
  }

  FileView {
    path: "/etc/localtime"
    watchChanges: true
    printErrors: false
    onFileChanged: root.tick()
  }

  FileView {
    id: shellFile
    path: root.shellJsonPath
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      try { root.shellJson = JSON.parse(text()) } catch (e) { root.shellJson = null }
      root.settingsLoaded = true
      root.tick()
    }
    onLoadFailed: {
      root.shellJson = null
      root.settingsLoaded = true
      root.tick()
    }
  }
}
