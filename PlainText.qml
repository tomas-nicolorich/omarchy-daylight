// Text that never interprets markup, in the panel's body style. Use it for
// every label, so text from settings, files or the network cannot render as
// rich text.
import QtQuick
import qs.Commons
import qs.Commons as Commons

Text {
  textFormat: Text.PlainText
  color: Commons.Color.foreground
  font.family: Style.font.family
  font.pixelSize: Style.font.body
}
