import NPCore
import NPHome
import NPPal
import NPReader
import NPSettings
import NPTheme
import SwiftUI
import UIKit

/// The signed-in app. iPhone: a tab bar, with Pal's floating bubble over
/// the tabs. iPad: a sidebar (TabView `.sidebarAdaptable`) where Pal is a
/// place of its own, and Library splits into list + reader. Pal's sheet
/// opens from anywhere (`nav.open(.pal(tool))`); opened offline, a slim
/// banner says so.
struct MainView: View {
    @Environment(AppNavigator.self) private var nav
    @Environment(AppSession.self) private var session
    @Environment(ThemeStore.self) private var themeStore

    var body: some View {
        @Bindable var nav = nav
        TabView(selection: $nav.tab) {
            Tab(NPTab.home.title, systemImage: NPTab.home.symbol, value: NPTab.home) {
                HomeRootView().shellChrome(on: .home)
            }
            Tab(NPTab.library.title, systemImage: NPTab.library.symbol, value: NPTab.library) {
                LibraryRootView().shellChrome(on: .library)
            }
            Tab(NPTab.pal.title, systemImage: NPTab.pal.symbol, value: NPTab.pal) {
                PalAssistantView().shellChrome(on: .pal)
            }
            Tab(NPTab.settings.title, systemImage: NPTab.settings.symbol, value: NPTab.settings) {
                SettingsRootView().shellChrome(on: .settings)
            }
        }
        .tabViewStyle(.sidebarAdaptable)
        .task(id: session.phase == .offline) {
            // VoiceOver hears it once each time the app goes offline (each
            // tab shows the banner; only this speaks), after the screen.
            guard session.phase == .offline else { return }
            do { try await Task.sleep(for: .milliseconds(700)) } catch { return }
            var text = AttributedString(OfflineBanner.message)
            text.accessibilitySpeechAnnouncementPriority = .default
            AccessibilityNotification.Announcement(text).post()
        }
        .sheet(isPresented: $nav.palOpen) {
            ThemedRoot(store: themeStore) { PalAssistantView(initialTool: nav.palTool) }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .focusedSceneValue(\.npAppShowing, true)
    }
}

/// What the shell lays over each tab's content (inside the tab, so the tab
/// bar — the iPad's floating one too — is never covered):
/// - the offline banner at the top, while the app runs offline;
/// - Pal's floating bubble (iPhone only — the iPad has Pal in its sidebar):
///   not on the Pal tab itself, not over an open document (the reader's
///   controls live there), and not when it's turned off in Settings.
private struct ShellChrome: ViewModifier {
    let tab: NPTab
    @Environment(AppNavigator.self) private var nav
    @Environment(AppSession.self) private var session
    @Environment(AppPreferences.self) private var preferences
    @Environment(\.horizontalSizeClass) private var sizeClass

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: bannerEdge, spacing: 0) {
                if session.phase == .offline { OfflineBanner(edge: bannerEdge) }
            }
            .overlay(alignment: .bottomTrailing) {
                if showsBubble {
                    PalBubble()
                        .padding(.trailing, 16)
                        .padding(.bottom, 12)
                }
            }
    }

    /// The iPad's floating tab bar sits at the top of the content: there the
    /// banner goes to the bottom edge instead.
    private var bannerEdge: VerticalEdge {
        UIDevice.current.userInterfaceIdiom == .pad && sizeClass == .regular ? .bottom : .top
    }

    private var showsBubble: Bool {
        guard UIDevice.current.userInterfaceIdiom == .phone, !preferences.palBubbleHidden else { return false }
        if tab == .pal { return false }
        if tab == .library && nav.openDocumentID != nil { return false }
        return true
    }
}

private extension View {
    func shellChrome(on tab: NPTab) -> some View { modifier(ShellChrome(tab: tab)) }
}

/// "Offline — showing what's saved on this device". Quiet, at the top, said
/// once by VoiceOver when it appears; a tap checks the server again.
private struct OfflineBanner: View {
    @Environment(AppSession.self) private var session
    @Environment(\.npTheme) private var theme
    var edge: VerticalEdge = .top
    static let message = "Offline — showing what’s saved on this device"

    var body: some View {
        Button {
            Task { await session.refresh(force: true) }
        } label: {
            HStack(spacing: 8) {
                if session.isChecking {
                    ProgressView().controlSize(.small).tint(theme.onSurfaceVariant)
                } else {
                    Image(systemName: "icloud.slash")
                        .foregroundStyle(theme.warn)
                }
                Text(Self.message)
                    .font(theme.font(.bodyMedium, size: 14, relativeTo: .footnote))
                    .foregroundStyle(theme.onSurface)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(theme.surfaceHigh, ignoresSafeAreaEdges: [])
            .overlay(alignment: edge == .top ? .bottom : .top) {
                Rectangle().fill(theme.line).frame(height: max(0.5, theme.border / 2))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(session.isChecking)
        .accessibilityLabel(Self.message)
        .accessibilityHint("Checks the server again")
    }
}
