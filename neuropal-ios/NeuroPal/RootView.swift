import NPAccount
import NPCore
import NPHome
import NPTheme
import SwiftUI

/// The boot gate: a quiet splash while connecting, sign-in when there's no
/// session, the app otherwise. The calming steps can open over ANY of
/// these — they never wait for the network or a sign-in.
struct RootView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @Environment(ThemeStore.self) private var themeStore
    let widgetGallery: Bool

    var body: some View {
        @Bindable var nav = nav
        ThemedRoot(store: themeStore) {
            Group {
                switch session.phase {
                case _ where widgetGallery: WidgetGalleryView()
                case .booting: SplashView()
                case .signedOut: SignInView()
                case .signedIn, .offline: MainView()
                }
            }
            .fullScreenCover(isPresented: $nav.calmOpen) {
                ThemedRoot(store: themeStore) { CalmStepsView() }
            }
        }
    }
}

private struct SplashView: View {
    @Environment(\.npTheme) private var theme
    var body: some View {
        ZStack {
            NPBackground()
            ProgressView().tint(theme.accentText)
                .accessibilityLabel("Opening NeuroPal")
        }
    }
}
