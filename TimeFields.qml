// An hour and a minute number field editing one "HH:MM" time.
import QtQuick
import qs.Commons
import qs.Ui
import "PanelModel.js" as Model

Row {
  id: root

  property string time: "00:00"
  property string hourLabel: ""
  property string minuteLabel: ""

  // The keyboard cursor: whether it is on this row, and on which field
  // (0 hour, 1 minute).
  property bool hasCursor: false
  property int cursorPart: 0

  readonly property bool editing: hourField.field.activeFocus || minuteField.field.activeFocus

  signal edited(string time)

  function focusPart(part) {
    (part === 0 ? hourField : minuteField).field.forceActiveFocus()
  }

  spacing: Style.space(12)

  NumberField {
    id: hourField
    label: root.hourLabel
    from: 0; to: 23
    value: Model.timePart(root.time, "hour")
    hasCursor: root.hasCursor && root.cursorPart === 0
    onModified: function(v) { root.edited(Model.withTimePart(root.time, "hour", v)) }
  }

  NumberField {
    id: minuteField
    label: root.minuteLabel
    from: 0; to: 59
    value: Model.timePart(root.time, "minute")
    hasCursor: root.hasCursor && root.cursorPart === 1
    onModified: function(v) { root.edited(Model.withTimePart(root.time, "minute", v)) }
  }
}
