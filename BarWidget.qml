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

BarWidget {
  id: root
  moduleName: "tomas.daylight"

  readonly property string pluginId: "tomas.daylight"
  readonly property string shellJsonPath: Quickshell.env("HOME") + "/.config/omarchy/shell.json"
  readonly property var locale: Qt.locale(Commons.I18n.formatLocale)

  property var shellJson: null
  property var installedThemes: []
  property double now: Date.now()
  property bool opened: false

  // Saved settings shown at once, until shell.json reloads with them.
  property var overrides: ({})

  readonly property var current: {
    var base = Config.pluginSettings(root.shellJson, root.pluginId)
    for (var k in root.overrides) base[k] = root.overrides[k]
    return base
  }
  readonly property var result: Schedule.evaluate({
    settings: root.current,
    location: null,
    now: root.now,
    state: null,
    currentTheme: "",
    installedThemes: root.installedThemes
  })
  readonly property var info: Model.summary(root.result, root.current)
  readonly property bool isLight: root.info.period === "light"
  readonly property string nextTime: new Date(root.info.nextAt).toLocaleTimeString(root.locale, Locale.ShortFormat)

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
        Config.settingsToSave(root.shellJson, root.pluginId, patch))
  }

  readonly property string tooltip: {
    if (Model.needsThemes(root.current)) return strings.t("widget.tooltip.chooseThemes", "Open Daylight to choose your light and dark themes")
    var theme = Model.plainText(root.info.nextTheme)
    if (root.current.paused) return strings.t("widget.tooltip.paused", "Paused. Next switch at %1").arg(root.nextTime)
    return strings.t("widget.tooltip.next", "Switching to %1 at %2").arg(theme).arg(root.nextTime)
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  FileView {
    path: root.shellJsonPath
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      try { root.shellJson = JSON.parse(text()) } catch (e) { root.shellJson = null }
      root.overrides = ({})
    }
    onLoadFailed: root.shellJson = null
  }

  Process {
    id: themeList
    command: ["omarchy", "theme", "list"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.installedThemes = text.split("\n").filter(function (l) { return l.trim() !== "" })
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
    opacity: root.current.paused ? 0.5 : 1.0
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

      // Cursor rows: 0 light theme, 1 dark theme, 2 light time, 3 dark time.
      // Time rows have two parts: 0 hour, 1 minute.
      property int row: 0
      property int part: 0
      property bool cursorOn: false
      blocked: lightDrop.popupOpen || darkDrop.popupOpen
        || lightHour.field.activeFocus || lightMinute.field.activeFocus
        || darkHour.field.activeFocus || darkMinute.field.activeFocus

      onCloseRequested: root.close()
      onTabRequested: function(direction) { keys.moveRow(direction) }
      onMoveRequested: function(dx, dy) {
        if (!keys.cursorOn) { keys.cursorOn = true; return }
        if (dy !== 0) keys.moveRow(dy)
        else if (keys.row >= 2) keys.part = dx > 0 ? 1 : 0
      }
      onActivateRequested: {
        if (!keys.cursorOn) return
        if (keys.row === 0) lightDrop.open()
        else if (keys.row === 1) darkDrop.open()
        else timeField(keys.row, keys.part).field.forceActiveFocus()
      }

      function moveRow(dy) {
        keys.row = Math.max(0, Math.min(3, keys.row + (dy > 0 ? 1 : -1)))
      }
      function timeField(r, p) {
        return r === 2 ? (p === 0 ? lightHour : lightMinute) : (p === 0 ? darkHour : darkMinute)
      }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(12)

        Text {
          textFormat: Text.PlainText
          text: strings.t(root.isLight ? "panel.period.light" : "panel.period.dark", root.isLight ? "Light period" : "Dark period")
          color: Commons.Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.subtitle
        }

        Text {
          textFormat: Text.PlainText
          width: parent.width
          wrapMode: Text.WordWrap
          color: Qt.darker(Commons.Color.foreground, 1.4)
          font.family: Style.font.family
          font.pixelSize: Style.font.body
          text: Model.needsThemes(root.current)
            ? strings.t("panel.chooseThemes", "Choose a light and a dark theme to start switching.")
            : strings.t("panel.next", "Next switch: %1 at %2").arg(Model.plainText(root.info.nextTheme)).arg(root.nextTime)
        }

        Dropdown {
          id: lightDrop
          width: parent.width
          label: strings.t("panel.lightTheme", "Light theme")
          options: Model.themeOptions(root.installedThemes, root.current.lightTheme)
          value: root.current.lightTheme || ""
          hasCursor: keys.cursorOn && keys.row === 0
          onChanged: function(v) { root.save({ lightTheme: v }) }
        }

        Dropdown {
          id: darkDrop
          width: parent.width
          label: strings.t("panel.darkTheme", "Dark theme")
          options: Model.themeOptions(root.installedThemes, root.current.darkTheme)
          value: root.current.darkTheme || ""
          hasCursor: keys.cursorOn && keys.row === 1
          onChanged: function(v) { root.save({ darkTheme: v }) }
        }

        Text {
          textFormat: Text.PlainText
          text: strings.t("panel.lightTime", "Light from")
          color: Commons.Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.body
        }
        Row {
          spacing: Style.space(12)
          NumberField {
            id: lightHour
            label: strings.t("panel.hour", "Hour")
            from: 0; to: 23
            value: parseInt(root.current.lightTime.split(":")[0], 10)
            hasCursor: keys.cursorOn && keys.row === 2 && keys.part === 0
            onModified: function(v) { root.save({ lightTime: Model.withTimePart(root.current.lightTime, "hour", v) }) }
          }
          NumberField {
            id: lightMinute
            label: strings.t("panel.minute", "Minute")
            from: 0; to: 59
            value: parseInt(root.current.lightTime.split(":")[1], 10)
            hasCursor: keys.cursorOn && keys.row === 2 && keys.part === 1
            onModified: function(v) { root.save({ lightTime: Model.withTimePart(root.current.lightTime, "minute", v) }) }
          }
        }

        Text {
          textFormat: Text.PlainText
          text: strings.t("panel.darkTime", "Dark from")
          color: Commons.Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.body
        }
        Row {
          spacing: Style.space(12)
          NumberField {
            id: darkHour
            label: strings.t("panel.hour", "Hour")
            from: 0; to: 23
            value: parseInt(root.current.darkTime.split(":")[0], 10)
            hasCursor: keys.cursorOn && keys.row === 3 && keys.part === 0
            onModified: function(v) { root.save({ darkTime: Model.withTimePart(root.current.darkTime, "hour", v) }) }
          }
          NumberField {
            id: darkMinute
            label: strings.t("panel.minute", "Minute")
            from: 0; to: 59
            value: parseInt(root.current.darkTime.split(":")[1], 10)
            hasCursor: keys.cursorOn && keys.row === 3 && keys.part === 1
            onModified: function(v) { root.save({ darkTime: Model.withTimePart(root.current.darkTime, "minute", v) }) }
          }
        }
      }
    }
  }
}
