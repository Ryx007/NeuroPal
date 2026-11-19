import NPAccount
import NPCore
import NPHome
import NPTheme
import SwiftUI

/// The boot gate: a quiet splash while connecting, sign-in when there's no
/// session, the app otherwise. The calming steps open over ANY of these —
/// they never wait for the network or a sign-in. (The cover hangs on the
/// ZStack, which stays put while its content changes, so it survives the
/// boot finishing underneath it.)
struct RootView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @Environment(ThemeStore.self) private var themeStore
    let widgetGallery: Bool
    var creatingAccount = false
    var editingServer = false
    var serverText: String?

    var body: some View {
        @Bindable var nav = nav
        ThemedRoot(store: themeStore) {
            ZStack {
                NPBackground()
                if widgetGallery {
                    WidgetGalleryView()
                } else {
                    switch session.phase {
                    case .booting: SplashView()
                    case .signedOut: SignInView(creatingAccount: creatingAccount, editingServer: editingServer,
                                                    serverText: serverText)
                    case .signedIn, .offline: MainView()
                    }
                }
            }
            .fullScreenCover(isPresented: $nav.calmOpen) {
                ThemedRoot(store: themeStore) { CalmStepsView() }
            }
            .focusedSceneValue(\.npNavigator, nav)
        }
    }
}

/// "Connecting…" while the server answers the session check (at most a
/// few seconds). If it takes a moment, the calming steps are offered here
/// too.
private struct SplashView: View {
    @Environment(AppNavigator.self) private var nav
    @Environment(\.npTheme) private var theme
    @State private var slow = false

    var body: some View {
        VStack(spacing: 14) {
            Spacer()
            ProgressView()
                .tint(theme.accentText)
                .accessibilityHidden(true)
            Text("Connecting…")
                .font(theme.font(.bodyMedium, size: 15, relativeTo: .callout))
                .foregroundStyle(theme.onSurfaceVariant)
            Spacer()
            if slow {
                Button {
                    nav.open(.calm)
                } label: {
                    Label("Need help right now?", systemImage: "heart")
                        .font(theme.font(.bodyMedium, size: 15, relativeTo: .callout))
                        .foregroundStyle(theme.onSurfaceVariant)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("I need help right now — open the calming steps")
                .padding(.bottom, 24)
                .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Connecting to your NeuroPal server")
        .task {
            do { try await Task.sleep(for: .seconds(1.5)) } catch { return }
            if theme.animates {
                withAnimation(.easeOut(duration: 0.3)) { slow = true }
            } else {
                slow = true
            }
        }
    }
}
