import NPCore
import NPDay
import NPTheme
import SwiftUI

/// Every widget at its real sizes, in the app — the widget extension draws
/// the same views (NPHome is linked into it), so `-NPScreen widgets`
/// screenshots show exactly what the Home Screen will. The buttons work
/// here too (they check in through the app instead of an App Intent).
public struct WidgetGalleryView: View {
    @Environment(\.npTheme) private var theme
    @Environment(DayStore.self) private var day
    @Environment(ThemeStore.self) private var themeStore
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @State private var reading: PalLogic.ReadingItem?

    public init() {}

    // iPhone sizes (points); the system scales them per device.
    private let small = CGSize(width: 170, height: 170)
    private let medium = CGSize(width: 364, height: 170)

    public var body: some View {
        let model = HomeWidgetModel(day: day.day, appearance: themeStore.appearance, reading: reading)
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Widgets")
                    .font(theme.font(.display, size: 30, relativeTo: .largeTitle))
                    .foregroundStyle(theme.onSurface)
                    .accessibilityAddTraits(.isHeader)
                section("Check-in") {
                    frame(small) { CheckInWidgetView(model: model, size: .small, action: galleryAction) }
                    frame(medium) { CheckInWidgetView(model: model, size: .medium, action: galleryAction) }
                }
                section("Next anchor") {
                    frame(small) { NextAnchorWidgetView(model: model, size: .small) }
                    frame(medium) { NextAnchorWidgetView(model: model, size: .medium) }
                }
                section("Continue reading") {
                    frame(small) { ReadingWidgetView(model: model, size: .small) }
                    frame(medium) { ReadingWidgetView(model: model, size: .medium) }
                }
                section("Lock Screen") {
                    lockFrame(CGSize(width: 76, height: 76), circle: true) { StateAccessoryView(model: model) }
                    lockFrame(CGSize(width: 172, height: 76), circle: false) { AnchorAccessoryView(model: model) }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(theme.surfaceLowest.ignoresSafeArea())
        .task(id: session.phase) {
            guard session.isSignedIn, let docs = try? await session.api.documents(query: nil) else { return }
            reading = PalLogic.unfinishedReading(docs)
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SkinLabel(title).accessibilityAddTraits(.isHeader)
            WrapLayout(spacing: 16, lineSpacing: 16) { content() }
        }
    }

    /// A Home Screen widget: the surface, the system's 16 pt margins, round corners.
    private func frame<Content: View>(_ size: CGSize, @ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(16)
            .frame(width: size.width, height: size.height)
            .background(theme.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(theme.line.opacity(0.6), lineWidth: 1))
            .environment(\.dynamicTypeSize, .large) // widgets don't grow with the app's text size
    }

    /// A Lock Screen widget: drawn in the system's monochrome style.
    private func lockFrame<Content: View>(_ size: CGSize, circle: Bool, @ViewBuilder content: () -> Content) -> some View {
        content()
            .foregroundStyle(theme.onSurface)
            .padding(circle ? 0 : 8)
            .frame(width: size.width, height: size.height)
            .background(theme.onSurface.opacity(0.12), in: RoundedRectangle(cornerRadius: circle ? size.width / 2 : 14,
                                                                             style: .continuous))
            .environment(\.dynamicTypeSize, .large)
    }

    private var galleryAction: WidgetCheckInAction {
        { state, label in
            AnyView(Button {
                if state == .red { nav.open(.calm) } else { day.checkIn(state) }
            } label: {
                label
            }
            .buttonStyle(.plain))
        }
    }
}
