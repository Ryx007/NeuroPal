import NPCore
import NPDay
import NPTheme
import SwiftUI

/// Every widget at its real sizes, in the app — the widget extension uses
/// the same views (NPHome is linked into it), so `-NPScreen widgets`
/// screenshots show exactly what the home screen will. SKELETON — Home+Pal agent.
public struct WidgetGalleryView: View {
    @Environment(\.npTheme) private var theme
    public init() {}
    public var body: some View { NPPlaceholder("Widgets") }
}
