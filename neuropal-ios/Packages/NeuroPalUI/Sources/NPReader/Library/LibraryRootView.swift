import NPCore
import NPTheme
import SwiftUI
import UniformTypeIdentifiers

/// The Library tab: documents, uploads and ingest status. iPhone: a list
/// that pushes the reader. iPad: a split view — the list beside the
/// reader, Ask in an inspector next to the text.
public struct LibraryRootView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @Environment(\.npTheme) private var theme
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var model = LibraryModel()
    @State private var columns: NavigationSplitViewVisibility = .all

    public init() {}

    public var body: some View {
        Group {
            if sizeClass == .compact {
                compact
            } else {
                split
            }
        }
        // Closing a document (back, or another one chosen) stops its voice.
        .onChange(of: nav.openDocumentID) { old, new in
            if let old, old != new { ReadAloudPlayer.shared.stopIfReading(old) }
        }
        // Ask beside the reader on iPad: give the text the room the list had.
        .onChange(of: nav.askOpen, initial: true) { _, open in
            if open, sizeClass != .compact, columns == .all { columns = .detailOnly }
        }
    }

    private var compact: some View {
        @Bindable var nav = nav
        return NavigationStack {
            LibraryList(model: model, selection: nil)
                .navigationDestination(item: $nav.openDocumentID) { id in
                    ReaderView(documentID: id)
                }
        }
    }

    private var split: some View {
        @Bindable var nav = nav
        return NavigationSplitView(columnVisibility: $columns) {
            LibraryList(model: model, selection: $nav.openDocumentID)
                .navigationSplitViewColumnWidth(min: 300, ideal: 360, max: 440)
        } detail: {
            if let id = nav.openDocumentID {
                ReaderView(documentID: id)
            } else {
                ReaderStateView(symbol: "books.vertical", title: "Pick something to read",
                                message: "Your papers and books open here, with read-aloud and Ask beside them.")
                    .background(NPBackground())
            }
        }
        .navigationSplitViewStyle(.balanced)
        .task {
            // Opened straight into Ask (a link, Home): the reader gets the list's room.
            if nav.askOpen, columns == .all {
                try? await Task.sleep(for: .milliseconds(80))
                columns = .detailOnly
            }
        }
    }
}

/// The list itself, shared by both layouts.
struct LibraryList: View {
    @Bindable var model: LibraryModel
    /// The split view's selection (iPad); nil on iPhone, where rows push.
    var selection: Binding<String?>?
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @Environment(\.npTheme) private var theme
    @State private var importing = false
    @State private var renaming: NPDocument?
    @State private var deleting: NPDocument?
    @State private var dropTargeted = false
    @State private var searchSeeded = false

    var body: some View {
        List(selection: selection) {
            if let problem = model.problem {
                problemBanner(problem)
            }
            if let notice = model.notice {
                noticeRow(notice)
            }
            if !model.uploads.isEmpty {
                Section {
                    ForEach(model.uploads) { job in
                        UploadRow(job: job,
                                  onRetry: { model.retry(job, api: session.api) },
                                  onDismiss: { model.dismiss(job) })
                            .libraryRow()
                    }
                } header: {
                    SkinLabel("Adding")
                }
            }
            if !model.loaded {
                ProgressView()
                    .tint(theme.accentText)
                    .frame(maxWidth: .infinity, minHeight: 120)
                    .libraryRow()
                    .accessibilityLabel("Opening your library")
            } else if model.documents.isEmpty, !model.isFiltered, model.problem == nil {
                emptyLibrary.libraryRow()
            } else if model.visible.isEmpty, model.loaded {
                nothingMatches.libraryRow()
            } else {
                Section {
                    ForEach(model.visible) { doc in
                        row(doc)
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(NPBackground())
        .overlay { if dropTargeted { dropOverlay } }
        .navigationTitle("Library")
        .searchable(text: $model.query, prompt: "Search your library")
        .refreshable { await model.refresh(session.api) }
        .task(id: model.query) {
            if model.loaded { try? await Task.sleep(for: .milliseconds(300)) }
            guard !Task.isCancelled else { return }
            await model.refresh(session.api)
        }
        .task(id: model.hasProcessing) {
            guard model.hasProcessing else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { return }
                await model.refresh(session.api)
            }
        }
        .task(id: model.notice) {
            guard model.notice != nil else { return }
            try? await Task.sleep(for: .seconds(5))
            model.notice = nil
        }
        .onAppear(perform: seedSearch)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { filterMenu }
            ToolbarItem(placement: .topBarTrailing) {
                Button { importing = true } label: { Label("Add a document", systemImage: "plus") }
                    .keyboardShortcut("o", modifiers: .command)
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: LibraryModel.contentTypes,
                      allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { model.upload(urls, staged: false, api: session.api) }
        }
        .dropDestination(for: DroppedFile.self) { files, _ in
            model.upload(files.map(\.url), staged: true, api: session.api)
            return !files.isEmpty
        } isTargeted: { dropTargeted = $0 }
        .sheet(item: $renaming) { doc in
            RenameSheet(document: doc) { title, subtitle in
                await model.rename(doc, title: title, subtitle: subtitle, api: session.api)
            }
            .npTheme(theme)
            .presentationDetents([.medium])
            .presentationBackground(theme.surfaceContainer)
        }
        .confirmationDialog("Delete this document?", isPresented: Binding(
            get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible, presenting: deleting) { doc in
            Button("Delete “\(doc.title)”", role: .destructive) {
                if nav.openDocumentID == doc.id { nav.openDocumentID = nil }
                Task { await model.delete(doc, api: session.api) }
            }
            Button("Keep it", role: .cancel) {}
        } message: { _ in
            Text("It's removed from your library on every device, with its reading progress and questions.")
        }
    }

    // MARK: Rows

    @ViewBuilder
    private func row(_ doc: NPDocument) -> some View {
        let isSelected = selection != nil && nav.openDocumentID == doc.id
        Group {
            if selection != nil {
                DocumentRow(document: doc, selected: isSelected)
                    .tag(doc.id)
                    .focusEffectDisabled()
            } else {
                Button { nav.openDocumentID = doc.id } label: {
                    DocumentRow(document: doc)
                }
                .buttonStyle(.plain)
            }
        }
        .libraryRow()
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button { deleting = doc } label: { Label("Delete", systemImage: "trash") }
                .tint(theme.error)
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            if doc.isReady {
                Button { nav.open(.ask(documentID: doc.id)) } label: { Label("Ask", systemImage: "sparkles") }
                    .tint(theme.accentFill)
            }
        }
        .contextMenu {
            Button { nav.open(.reader(documentID: doc.id)) } label: { Label("Read", systemImage: "book") }
            if doc.isReady {
                Button { nav.open(.ask(documentID: doc.id)) } label: { Label("Ask about this", systemImage: "sparkles") }
            }
            Button { renaming = doc } label: { Label("Rename", systemImage: "pencil") }
            Divider()
            Button(role: .destructive) { deleting = doc } label: { Label("Delete", systemImage: "trash") }
        }
        .accessibilityAction(named: "Ask about this") { nav.open(.ask(documentID: doc.id)) }
        .accessibilityAction(named: "Rename") { renaming = doc }
        .accessibilityAction(named: "Delete") { deleting = doc }
    }

    private var filterMenu: some View {
        Menu {
            Picker("Show", selection: $model.filter) {
                ForEach(LibraryFilter.allCases) { f in
                    Text(f.title).tag(f)
                }
            }
        } label: {
            Label("Show: \(model.filter.title)",
                  systemImage: model.filter == .all ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
        }
        .accessibilityLabel("Filter, showing \(model.filter.title)")
    }

    // MARK: States

    private var emptyLibrary: some View {
        VStack(spacing: 14) {
            Image(systemName: "books.vertical")
                .font(theme.font(.bodySemi, size: 38, relativeTo: .largeTitle))
                .foregroundStyle(theme.accentText)
                .accessibilityHidden(true)
            Text("Your library is empty")
                .font(theme.title)
                .foregroundStyle(theme.onSurface)
                .accessibilityAddTraits(.isHeader)
            Text("Add a paper, a book or your notes. NeuroPal reads them aloud with the words highlighted, and answers questions about them.")
                .font(theme.bodyFont)
                .foregroundStyle(theme.onSurfaceVariant)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button { importing = true } label: { Label("Add a document", systemImage: "plus") }
                .buttonStyle(.npPrimary)
                .padding(.top, 4)
            Text("PDF, EPUB, Word, PowerPoint, Markdown, text and DjVu. On iPad you can also drop files here.")
                .font(theme.font(.body, size: 13, relativeTo: .footnote))
                .foregroundStyle(theme.onSurfaceVariant)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 40)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity)
    }

    private var nothingMatches: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(theme.font(.bodySemi, size: 28, relativeTo: .title))
                .foregroundStyle(theme.outline)
                .accessibilityHidden(true)
            let q = model.query.trimmingCharacters(in: .whitespaces)
            Text(q.isEmpty ? "Nothing in \(model.filter.title.lowercased()) yet." : "Nothing matches “\(q)”.")
                .font(theme.bodyFont)
                .foregroundStyle(theme.onSurfaceVariant)
                .multilineTextAlignment(.center)
            Button("Show everything") {
                model.query = ""
                model.filter = .all
            }
            .buttonStyle(ReaderChipStyle(selected: true))
        }
        .padding(.vertical, 36)
        .frame(maxWidth: .infinity)
    }

    private func problemBanner(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(theme.warn)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 8) {
                Text(model.documents.isEmpty ? text : "\(text) Showing what was loaded before.")
                    .font(theme.font(.body, size: 14, relativeTo: .footnote))
                    .foregroundStyle(theme.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Try again") { Task { await model.refresh(session.api) } }
                    .buttonStyle(ReaderChipStyle(selected: true))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .readerCard()
        .libraryRow()
        .accessibilityElement(children: .contain)
    }

    private func noticeRow(_ text: String) -> some View {
        Text(text)
            .font(theme.font(.body, size: 14, relativeTo: .footnote))
            .foregroundStyle(theme.onSurface)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .readerCard()
            .libraryRow()
            .onAppear { AccessibilityNotification.Announcement(text).post() }
    }

    private var dropOverlay: some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .strokeBorder(theme.accentText, style: StrokeStyle(lineWidth: 3, dash: [10, 8]))
            .background(theme.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay {
                Label("Drop to add to your library", systemImage: "tray.and.arrow.down")
                    .font(theme.headline)
                    .foregroundStyle(theme.accentText)
                    .padding(16)
                    .readerPanel(radius: 18)
            }
            .padding(10)
            .allowsHitTesting(false)
    }

    /// `-NPLibrarySearch` (mock mode): start with a search, for screenshots.
    private func seedSearch() {
        guard !searchSeeded else { return }
        searchSeeded = true
        if ReaderLaunch.isMock(session.api), let q = ReaderLaunch.librarySearch, !q.isEmpty { model.query = q }
    }
}

private extension View {
    func libraryRow() -> some View {
        listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
    }
}

/// A file dropped onto the library (iPad), copied out of the drag session.
struct DroppedFile: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .item) { received in
            DroppedFile(url: try UploadStaging.stage(received.file))
        }
    }
}
