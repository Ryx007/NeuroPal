import NPCore
import NPTokens
import Observation
import SwiftUI

/// The user's look: the appearance object, saved locally (appearance.json in
/// the shared container, so widgets match) and synced with the server
/// (GET/PUT /api/me/appearance, newest `updatedAt` wins; a 409 hands back
/// the server's newer copy, which is adopted).
///
/// SKELETON: local save + apply only; the Theme agent adds server sync and
/// the widget refresh.
@MainActor
@Observable
public final class ThemeStore {
    public nonisolated static let fileName = "appearance.json"

    public private(set) var appearance: Appearance
    public private(set) var palette: Palette
    @ObservationIgnored private let persist: Bool

    public init(appearance: Appearance? = nil, persist: Bool = true) {
        self.persist = persist
        let saved: Appearance? = persist
            ? SharedContainer.read(JSONValue.self, from: Self.fileName).map { Tokens.normalizeAppearance($0) }
            : nil
        let a = appearance ?? saved ?? .default
        self.appearance = a
        self.palette = Tokens.palette(for: a)
    }

    public func theme(reduceMotion: Bool) -> NPTheme {
        NPTheme(palette: palette, appearance: appearance, reduceMotion: reduceMotion)
    }

    /// Change the look (stamps `updatedAt`, saves, re-resolves the palette).
    public func apply(_ next: Appearance) {
        var a = next
        a.updatedAt = NPDateFormat.string(Date())
        appearance = a
        palette = Tokens.palette(for: a)
        save()
    }

    public func update(_ change: (inout Appearance) -> Void) {
        var a = appearance
        change(&a)
        apply(a)
    }

    /// Adopt a copy from the server without re-stamping it.
    public func adopt(_ json: JSONValue) {
        let a = Tokens.normalizeAppearance(json)
        appearance = a
        palette = Tokens.palette(for: a)
        save()
    }

    private func save() {
        guard persist, let json = try? JSONValue(encoding: appearance) else { return }
        SharedContainer.write(json, to: Self.fileName)
    }
}

/// Puts the current theme into the environment, following the OS Reduce
/// Motion setting. Wrap the app's root in it.
public struct ThemedRoot<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let store: ThemeStore
    private let content: Content

    public init(store: ThemeStore, @ViewBuilder content: () -> Content) {
        self.store = store
        self.content = content()
    }

    public var body: some View {
        content.npTheme(store.theme(reduceMotion: reduceMotion))
    }
}
