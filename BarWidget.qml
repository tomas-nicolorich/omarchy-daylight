// Daylight's bar widget and settings panel.
//
// A sun or moon icon shows the current period; the tooltip names the next
// switch. Clicking opens the panel. The scheduler itself is Service.qml: this
// file only shows and edits settings, so switching runs without the widget.
import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Config.js" as Config
import "Schedule.js" as Schedule
import "PanelModel.js" as Model
import "Location.js" as Location
import "Messages.js" as Messages
import "Paths.js" as Paths
// Not named Util: that is the shell's own Commons.Util singleton.
import "Util.js" as Helpers

BarWidget {
  id: root
  moduleName: Paths.PLUGIN_ID

  readonly property var files: Paths.paths(Quickshell.env("HOME"), Quickshell.env("XDG_STATE_HOME"))
  readonly property var locale: Qt.locale(Commons.I18n.formatLocale)

  property var shellJson: null
  property var installedThemes: []
  property double now: Date.now()
  property bool opened: false

  // Saved settings shown at once, until shell.json reloads with them.
  property var overrides: ({})

  // The plugin's settings with the unsaved overrides applied. (BarWidget
  // already has a `settings` property of its own.)
  readonly property var activeSettings: {
    var base = Config.pluginSettings(root.shellJson, Paths.PLUGIN_ID)
    for (var k in root.overrides) base[k] = root.overrides[k]
    return base
  }
  // Location, resolved as the scheduler does: Omarchy's weather file first,
  // then the location Daylight cached from geo.omarchy.org in its state file.
  property var weather: ({ name: "", latitude: null, longitude: null })
  property var savedState: ({})
  readonly property var location: Location.resolveLocation(root.weather, root.savedState, null).location
  // Only a location from the geo lookup can be refreshed.
  readonly property bool canRefreshLocation: Location.isAuto(root.weather)

  // What the schedule says right now; the saved scheduler state is not needed
  // to show the period and the next switch.
  readonly property var evaluation: Schedule.evaluate({
    settings: root.activeSettings,
    location: root.location,
    now: root.now,
    state: null,
    currentTheme: "",
    installedThemes: root.installedThemes
  })
  readonly property var summary: Model.summary(root.evaluation, root.activeSettings)
  readonly property bool isLight: root.summary.period === "light"
  readonly property string nextTime: root.clock(root.summary.nextAt)
  readonly property var modeInfo: Model.modeView(root.evaluation, root.activeSettings)

  function clock(ms) {
    return ms === null ? "" : new Date(ms).toLocaleTimeString(root.locale, Locale.ShortFormat)
  }

  function translate(key, fallback) {
    return strings.t(key, fallback)
  }

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  function open() { root.opened = true; root.refresh() }
  function close() { root.opened = false }
  function toggle() { if (root.opened) root.close(); else root.open() }

  function refresh() {
    root.now = Date.now()
    if (!themeList.running) themeList.running = true
  }

  function save(patch) {
    for (var k in patch) root.overrides[k] = patch[k]
    root.overridesChanged()
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName,
        Config.settingsToSave(root.shellJson, Paths.PLUGIN_ID, patch))
  }

  // Switch now: apply the other period's theme. The scheduler only acts at a
  // boundary, so this counts as a manual change and lasts until the next one.
  readonly property string switchTheme: Model.switchTarget(root.summary.period, root.activeSettings, root.installedThemes)

  function switchNow() {
    if (!root.switchTheme) return
    Commons.Util.execArgv(["omarchy", "theme", "set", root.switchTheme])
  }

  function setPaused(paused) { root.save({ paused: paused }) }

  // Ask the scheduler to look the location up again: it watches the state
  // file, sees the request and re-evaluates.
  function refreshLocation() {
    if (!root.canRefreshLocation) return
    var asked = Location.refreshRequest(root.savedState, Date.now())
    Quickshell.execDetached(["bash", "-c", Paths.WRITE_FILE_SCRIPT,
      "bash", root.files.stateFile, JSON.stringify(asked)])
  }

  readonly property string tooltip: Messages.tooltip(root.activeSettings, root.summary, root.nextTime, root.translate)

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  FileView {
    path: root.files.shellJson
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      try { root.shellJson = JSON.parse(text()) } catch (e) { root.shellJson = null }
      root.overrides = ({})
    }
    onLoadFailed: root.shellJson = null
  }

  FileView {
    path: root.files.weatherFile
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.weather = Location.parseWeatherFile(text())
    onLoadFailed: root.weather = Location.parseWeatherFile("")
  }

  FileView {
    path: root.files.stateFile
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      var parsed = null
      try { parsed = JSON.parse(text()) } catch (e) { parsed = null }
      root.savedState = (parsed && typeof parsed === "object") ? parsed : {}
    }
    onLoadFailed: root.savedState = ({})
  }

  Process {
    id: themeList
    command: ["omarchy", "theme", "list"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.installedThemes = Helpers.parseThemeList(text) || []
    }
  }

  Component.onCompleted: root.refresh()

  Timer {
    interval: 30000
    running: true
    repeat: true
    onTriggered: root.refresh()
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // Nerd Font weather-sunny and weather-night glyphs.
    text: root.isLight ? "󰖙" : "󰖔"
    opacity: root.activeSettings.paused ? 0.5 : 1.0
    slotSize: Style.bar.statusSlot
    tooltipText: root.tooltip
    Behavior on opacity { NumberAnimation { duration: Style.duration(180); easing.type: Easing.OutCubic } }
    onPressed: function(b) { root.toggle() }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: panel.loadedContent
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(panel.loadedContentHeight, Style.space(520))

    content: PanelKeyCatcher {
      id: keys
      anchors.fill: parent
      implicitHeight: column.implicitHeight

      // The cursor row (one of Model.ROW) and, on a time row, its part:
      // 0 hour, 1 minute.
      property int row: Model.ROW.lightTheme
      property int part: 0
      property bool cursorOn: false
      blocked: lightDrop.popupOpen || darkDrop.popupOpen
        || lightTime.editing || darkTime.editing
        || sunriseOffset.field.activeFocus || sunsetOffset.field.activeFocus

      onCloseRequested: root.close()
      onTabRequested: function(direction) { keys.moveRow(direction) }
      onMoveRequested: function(dx, dy) {
        if (!keys.cursorOn) { keys.cursorOn = true; return }
        if (dy !== 0) keys.moveRow(dy)
        else if (keys.row === Model.ROW.mode) root.save({ mode: dx > 0 ? "fixed" : "sun" })
        else if (root.modeInfo.showTimes && (keys.row === Model.ROW.lightEdge || keys.row === Model.ROW.darkEdge))
          keys.part = dx > 0 ? 1 : 0
      }
      onActivateRequested: {
        if (!keys.cursorOn) return
        if (keys.row === Model.ROW.switchNow) root.switchNow()
        else if (keys.row === Model.ROW.refreshLocation) root.refreshLocation()
        else if (keys.row === Model.ROW.pause) root.setPaused(!root.activeSettings.paused)
        else if (keys.row === Model.ROW.lightTheme) lightDrop.open()
        else if (keys.row === Model.ROW.darkTheme) darkDrop.open()
        else if (keys.row === Model.ROW.mode) root.save({ mode: root.activeSettings.mode === "sun" ? "fixed" : "sun" })
        else if (root.modeInfo.showOffsets) (keys.row === Model.ROW.lightEdge ? sunriseOffset : sunsetOffset).field.forceActiveFocus()
        else (keys.row === Model.ROW.lightEdge ? lightTime : darkTime).focusPart(keys.part)
      }

      function moveRow(dy) {
        keys.row = Model.moveRow(keys.row, dy, root.canRefreshLocation)
      }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(12)

        PlainText {
          text: strings.t(root.isLight ? "panel.period.light" : "panel.period.dark", root.isLight ? "Light period" : "Dark period")
          font.pixelSize: Style.font.subtitle
        }

        PlainText {
          width: parent.width
          wrapMode: Text.WordWrap
          color: Qt.darker(Commons.Color.foreground, 1.4)
          text: Messages.nextSwitch(root.activeSettings, root.summary, root.nextTime, root.translate)
        }

        Dropdown {
          id: lightDrop
          width: parent.width
          label: strings.t("panel.lightTheme", "Light theme")
          options: Model.themeOptions(root.installedThemes, root.activeSettings.lightTheme)
          value: root.activeSettings.lightTheme || ""
          hasCursor: keys.cursorOn && keys.row === Model.ROW.lightTheme
          onChanged: function(v) { root.save({ lightTheme: v }) }
        }

        Dropdown {
          id: darkDrop
          width: parent.width
          label: strings.t("panel.darkTheme", "Dark theme")
          options: Model.themeOptions(root.installedThemes, root.activeSettings.darkTheme)
          value: root.activeSettings.darkTheme || ""
          hasCursor: keys.cursorOn && keys.row === Model.ROW.darkTheme
          onChanged: function(v) { root.save({ darkTheme: v }) }
        }

        // ---- Mode section: sun or fixed times ----
        ButtonGroup {
          id: modeToggle
          options: [
            { value: "sun", label: strings.t("panel.mode.sun", "Sun") },
            { value: "fixed", label: strings.t("panel.mode.fixed", "Fixed times") }
          ]
          value: root.activeSettings.mode
          cursorIndex: keys.cursorOn && keys.row === Model.ROW.mode ? (root.activeSettings.mode === "sun" ? 0 : 1) : -1
          onChanged: function(v) { root.save({ mode: v }) }
        }

        PlainText {
          visible: root.modeInfo.noLocation
          width: parent.width
          wrapMode: Text.WordWrap
          color: Commons.Color.accent
          text: strings.t("panel.noLocation", "No location found, so Daylight is using the fixed times.")
        }

        PlainText {
          visible: root.modeInfo.showOffsets
          width: parent.width
          wrapMode: Text.WordWrap
          color: Qt.darker(Commons.Color.foreground, 1.4)
          text: root.modeInfo.sunState === "polarDay" ? strings.t("panel.sun.polarDay", "The sun does not set today.")
            : root.modeInfo.sunState === "polarNight" ? strings.t("panel.sun.polarNight", "The sun does not rise today.")
            : Messages.fill(strings.t("panel.sun.today", "Sunrise %1, sunset %2"), [root.clock(root.modeInfo.sunrise), root.clock(root.modeInfo.sunset)])
        }

        Row {
          visible: root.modeInfo.showOffsets
          spacing: Style.space(12)
          NumberField {
            id: sunriseOffset
            label: strings.t("panel.sunriseOffset", "Sunrise offset (min)")
            from: -180; to: 180
            value: root.activeSettings.sunriseOffsetMinutes
            hasCursor: keys.cursorOn && keys.row === Model.ROW.lightEdge
            onModified: function(v) { root.save({ sunriseOffsetMinutes: v }) }
          }
          NumberField {
            id: sunsetOffset
            label: strings.t("panel.sunsetOffset", "Sunset offset (min)")
            from: -180; to: 180
            value: root.activeSettings.sunsetOffsetMinutes
            hasCursor: keys.cursorOn && keys.row === Model.ROW.darkEdge
            onModified: function(v) { root.save({ sunsetOffsetMinutes: v }) }
          }
        }

        PlainText {
          visible: root.modeInfo.showTimes
          text: strings.t("panel.lightTime", "Light from")
        }
        TimeFields {
          id: lightTime
          visible: root.modeInfo.showTimes
          time: root.activeSettings.lightTime
          hourLabel: strings.t("panel.hour", "Hour")
          minuteLabel: strings.t("panel.minute", "Minute")
          hasCursor: keys.cursorOn && keys.row === Model.ROW.lightEdge
          cursorPart: keys.part
          onEdited: function(t) { root.save({ lightTime: t }) }
        }

        PlainText {
          visible: root.modeInfo.showTimes
          text: strings.t("panel.darkTime", "Dark from")
        }
        TimeFields {
          id: darkTime
          visible: root.modeInfo.showTimes
          time: root.activeSettings.darkTime
          hourLabel: strings.t("panel.hour", "Hour")
          minuteLabel: strings.t("panel.minute", "Minute")
          hasCursor: keys.cursorOn && keys.row === Model.ROW.darkEdge
          cursorPart: keys.part
          onEdited: function(t) { root.save({ darkTime: t }) }
        }

        // Refresh location (geo lookup only), Switch now and Pause.
        Button {
          id: refreshButton
          visible: root.canRefreshLocation
          width: parent.width
          text: strings.t("panel.refreshLocation", "Refresh location")
          hasCursor: keys.cursorOn && keys.row === Model.ROW.refreshLocation
          onClicked: root.refreshLocation()
        }

        Button {
          id: switchButton
          width: parent.width
          text: strings.t("panel.switchNow", "Switch now")
          enabled: !!root.switchTheme
          hasCursor: keys.cursorOn && keys.row === Model.ROW.switchNow
          onClicked: root.switchNow()
        }

        Toggle {
          id: pauseToggle
          width: parent.width
          label: strings.t("panel.pause", "Pause switching")
          description: strings.t("panel.pause.description", "Keep the current theme until you resume.")
          checked: !!root.activeSettings.paused
          hasCursor: keys.cursorOn && keys.row === Model.ROW.pause
          onClicked: root.setPaused(!root.activeSettings.paused)
        }
      }
    }
  }
}
