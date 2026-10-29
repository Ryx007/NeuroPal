import NPCore
import NPDay
import NPTheme
import SwiftUI

/// Pal's assistant: What now?, Break it down, Brain dump, Sit with me, Talk.
/// Used as the sheet (from anywhere) and as the Pal tab.
/// SKELETON — owned by the Home+Pal agent (mirror
/// neuropal-expo-app/src/components/pal/).
public struct PalAssistantView: View {
    @Environment(\.npTheme) private var theme
    public let initialTool: PalTool?

    public init(initialTool: PalTool? = nil) { self.initialTool = initialTool }

    public var body: some View {
        NPPlaceholder("Pal", note: "What now? · Break it down · Brain dump · Sit with me · Talk")
    }
}

/// The floating Pal bubble (iPhone; iPad shows Pal in the sidebar instead).
public struct PalBubble: View {
    @Environment(AppNavigator.self) private var nav
    @Environment(\.npTheme) private var theme

    public init() {}

    public var body: some View {
        Button {
            nav.open(.pal(nil))
        } label: {
            Image(systemName: "face.smiling")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(theme.accentInk)
                .frame(width: 52, height: 52)
                .background(theme.accentFill, in: Circle())
        }
        .accessibilityLabel("Open Pal")
    }
}
