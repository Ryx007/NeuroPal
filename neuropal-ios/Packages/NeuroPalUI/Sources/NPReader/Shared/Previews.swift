#if DEBUG
import NPCore
import NPTheme
import SwiftUI

/// Mock session, navigator and preferences for the reader previews.
struct ReaderPreviewHost<Content: View>: View {
    @State private var session = AppSession(
        host: URL(string: "https://mock.neuropal.invalid")!,
        store: MemorySessionStore(StoredSession(host: "https://mock.neuropal.invalid", token: "mock-token",
                                                user: MockFixtures.user)),
        makeAPI: { host in MockNeuroPalAPI(host: host, latency: .zero) })
    @State private var nav = AppNavigator()
    @State private var prefs = AppPreferences(defaults: nil)
    private let theme: NPTheme
    private let content: Content

    init(theme: NPTheme = .classic, @ViewBuilder content: () -> Content) {
        self.theme = theme
        self.content = content()
    }

    var body: some View {
        content
            .environment(session)
            .environment(nav)
            .environment(prefs)
            .npTheme(theme)
    }
}

#Preview("Library") {
    ReaderPreviewHost { LibraryRootView() }
}

#Preview("Reader · Signal") {
    ReaderPreviewHost(theme: .signal) {
        NavigationStack { ReaderView(documentID: MockFixtures.paperID) }
    }
}

#Preview("Ask") {
    ReaderPreviewHost { AskView(documentID: MockFixtures.paperID) }
}
#endif
