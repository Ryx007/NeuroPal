import NPCore
import NPTheme
import SwiftUI

/// The Library tab: documents, upload, ingest status; opening one shows the
/// reader (iPhone: pushed; iPad: the detail column of a split view).
/// SKELETON — owned by the Library+Reader+Ask agent (mirror
/// neuropal-expo-app/src/screens/LibraryScreen.jsx and ReaderScreen.jsx).
public struct LibraryRootView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @Environment(\.npTheme) private var theme
    @State private var documents: [NPDocument] = []

    public init() {}

    public var body: some View {
        @Bindable var nav = nav
        NavigationSplitView {
            List(documents, selection: $nav.openDocumentID) { doc in
                VStack(alignment: .leading, spacing: 4) {
                    Text(doc.title).font(theme.headline).foregroundStyle(theme.onSurface)
                    Text(doc.status.rawValue).font(theme.caption).foregroundStyle(theme.onSurfaceVariant)
                }
                .tag(doc.id)
            }
            .scrollContentBackground(.hidden)
            .background(NPBackground())
            .navigationTitle("Library")
            .task { documents = (try? await session.api.documents(query: nil)) ?? [] }
        } detail: {
            if let id = nav.openDocumentID {
                ReaderView(documentID: id)
            } else {
                NPPlaceholder("Pick something to read", note: "Your papers and books open here.")
            }
        }
    }
}

/// One document: text with read-aloud highlighting, PDF pages, EPUB.
public struct ReaderView: View {
    public let documentID: String
    public init(documentID: String) { self.documentID = documentID }
    public var body: some View { NPPlaceholder("Reader") }
}

/// Chat with a document: answers grounded in it, with sources.
public struct AskView: View {
    public let documentID: String
    public init(documentID: String) { self.documentID = documentID }
    public var body: some View { NPPlaceholder("Ask") }
}
