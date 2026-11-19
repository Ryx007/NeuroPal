import NPCore
import NPTheme
import SwiftUI
import UIKit

/// One document: its text with read-aloud highlighting (the core of
/// NeuroPal), the original pages of a pdf/arxiv, EPUB books in their own
/// layout — and Ask beside it (iPad inspector) or in a sheet (iPhone).
public struct ReaderView: View {
    public let documentID: String

    public init(documentID: String) {
        self.documentID = documentID
    }

    public var body: some View {
        // A fresh screen (and model) per document, however the caller reuses this view.
        ReaderScreen(documentID: documentID).id(documentID)
    }
}

enum ReaderSheet: String, Identifiable {
    case chapters, options
    var id: String { rawValue }
}

extension VoiceSettings {
    @MainActor
    init(_ prefs: AppPreferences, muted: Bool) {
        self.init(wordsPerMinute: prefs.wordsPerMinute, pitch: prefs.pitch, voiceIdentifier: prefs.voiceIdentifier,
                  muted: muted)
    }
}

struct ReaderScreen: View {
    let documentID: String
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @Environment(AppPreferences.self) private var prefs
    @Environment(\.npTheme) private var theme
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: ReaderModel
    @State private var sheet: ReaderSheet?
    @State private var askDetent: PresentationDetent = .medium
    @State private var handle = ReaderTextHandle()
    @State private var epubSubtitle: String?

    init(documentID: String) {
        self.documentID = documentID
        _model = State(initialValue: ReaderModel(documentID: documentID))
    }

    private var voice: VoiceSettings {
        VoiceSettings(prefs, muted: ReaderLaunch.isMock(session.api) && ReaderLaunch.readAloud)
    }

    private var pageColor: Color {
        switch model.phase {
        case .text, .epub: return ReaderPage(background: prefs.readerBackground, theme: theme).background
        default: return theme.surface
        }
    }

    var body: some View {
        @Bindable var nav = nav
        content
            .background(pageColor.ignoresSafeArea())
            .navigationTitle(model.document?.title ?? "Reader")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .toolbar(sizeClass == .compact ? .hidden : .automatic, for: .tabBar)
            .inspector(isPresented: $nav.askOpen) { askPanel }
            .sheet(item: $sheet) { which in sheetContent(which) }
            .task { await model.open(api: session.api) }
            .onChange(of: voice, initial: true) { _, settings in ReadAloudPlayer.shared.apply(settings) }
            .onChange(of: scenePhase) { _, phase in
                if phase != .active { Task { await model.saveNow(leaving: phase == .background) } }
            }
            .onChange(of: ReaderInbox.shared.citations[documentID]) { _, citation in
                guard let citation, model.phase == .text else { return }
                ReaderInbox.shared.citations[documentID] = nil
                model.show(citation)
            }
            .onDisappear {
                model.stopWaiting()
                Task { await model.saveNow(leaving: true) }
            }
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .loading:
            ProgressView()
                .controlSize(.large)
                .tint(theme.accentText)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel("Opening the document")
        case .processing:
            ProcessingView(document: model.document)
        case .failed(let reason):
            ReaderStateView(symbol: "exclamationmark.triangle", title: "This file couldn't be read",
                            message: "\(reason) Reading it again can help; so can uploading it as an EPUB or text file.") {
                Button("Try again") { model.readAgain() }
                    .buttonStyle(.npPrimary)
                    .accessibilityHint("Reads this file again")
            }
        case .unavailable(let reason):
            ReaderStateView(symbol: "wifi.exclamationmark", title: "Can't open this right now", message: reason) {
                Button("Try again") { Task { await model.retry() } }
                    .buttonStyle(.npPrimary)
            }
        case .empty:
            ReaderStateView(symbol: "doc", title: "Nothing to read yet",
                            message: "This document has no text. If it's a scan, a version with selectable text will work better.")
        case .text:
            if let text = model.text {
                TextReaderScreen(model: model, text: text, handle: handle, sheet: $sheet)
            }
        case .epub:
            if let doc = model.document {
                EpubReaderView(document: doc, sheet: $sheet, subtitle: $epubSubtitle)
            }
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            ReaderTitle(title: model.document?.title ?? "", subtitle: subtitle)
        }
        if model.phase == .text, sizeClass == .compact {
            ToolbarItemGroup(placement: .topBarTrailing) {
                askButton
                moreMenu
            }
        }
        if model.phase == .text, sizeClass != .compact {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if model.hasPages { modePicker }
                Button { sheet = .chapters } label: { Label("Contents", systemImage: "list.bullet") }
                    .keyboardShortcut("t", modifiers: [.command, .shift])
                Button { handle.find() } label: { Label("Find in document", systemImage: "magnifyingglass") }
                    .disabled(model.mode == .pages)
                Button { sheet = .options } label: { Label("Reading options", systemImage: "textformat.size") }
                askButton
            }
        }
        if model.phase == .epub {
            ToolbarItem(placement: .topBarTrailing) { askButton }
        }
    }

    private var askButton: some View {
        Button { nav.askOpen.toggle() } label: {
            Label("Ask", systemImage: "sparkles")
                .labelStyle(.titleAndIcon)
        }
        .accessibilityLabel(nav.askOpen ? "Close Ask" : "Ask about this document")
        .keyboardShortcut("a", modifiers: [.command, .shift])
    }

    private var moreMenu: some View {
        Menu {
            Button { sheet = .chapters } label: { Label("Contents", systemImage: "list.bullet") }
            if model.hasPages {
                Button { model.setMode(model.mode == .text ? .pages : .text) } label: {
                    model.mode == .text
                        ? Label("Original pages", systemImage: "doc.richtext")
                        : Label("Text view", systemImage: "text.alignleft")
                }
            }
            Button { handle.find() } label: { Label("Find in document", systemImage: "magnifyingglass") }
                .disabled(model.mode == .pages)
            Button { sheet = .options } label: { Label("Reading options", systemImage: "textformat.size") }
        } label: {
            Label("More", systemImage: "ellipsis.circle")
        }
        .accessibilityLabel("More reader actions")
    }

    private var modePicker: some View {
        Picker("View", selection: Binding(get: { model.mode }, set: { model.setMode($0) })) {
            Text("Text").tag(ReaderModel.Mode.text)
            Text("Pages").tag(ReaderModel.Mode.pages)
        }
        .pickerStyle(.segmented)
        .fixedSize()
        .accessibilityLabel("Show the text or the original pages")
    }

    private var subtitle: String? {
        if model.phase == .epub { return epubSubtitle }
        guard model.phase == .text, let text = model.text else { return nil }
        if model.mode == .pages, let count = model.document?.pageCount, count > 0 {
            return "Page \(model.page) of \(count)"
        }
        let page = model.currentPage.flatMap { p in text.lastPage.map { "p. \(p) of \($0)" } }
        switch (model.chapterTitle, page) {
        case let (chapter?, page?): return "\(chapter) · \(page)"
        case let (chapter?, nil): return chapter
        case let (nil, page?): return page
        default: return nil
        }
    }

    // MARK: Ask and sheets

    private var askPanel: some View {
        AskView(documentID: documentID)
            .environment(\.npCitationJump, CitationJump { citation in
                if model.phase == .text {
                    model.show(citation)
                } else {
                    ReaderInbox.shared.citations[documentID] = citation
                }
                if sizeClass == .compact { askDetent = .medium }
            })
            .npTheme(theme)
            .inspectorColumnWidth(min: 300, ideal: 380, max: 520)
            .presentationDetents([.medium, .large], selection: $askDetent)
            .presentationBackgroundInteraction(.enabled(upThrough: .medium))
            .presentationBackground(theme.surfaceContainer)
            .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private func sheetContent(_ which: ReaderSheet) -> some View {
        switch which {
        case .chapters:
            if let text = model.text {
                ChaptersSheet(text: text, cursor: model.cursor, wordsPerMinute: prefs.wordsPerMinute,
                              onChapter: { model.jump(toChapter: $0) }, onPage: { model.jump(toPage: $0) })
                    .npTheme(theme)
                    .presentationDetents([.medium, .large])
                    .presentationBackground(theme.surfaceContainer)
            }
        case .options:
            ReadingOptionsSheet(language: model.language)
                .environment(prefs)
                .npTheme(theme)
                .presentationDetents([.medium, .large])
                .presentationBackground(theme.surfaceContainer)
        }
    }
}

/// The text reader: the page, the docked player, and their glue.
struct TextReaderScreen: View {
    @Bindable var model: ReaderModel
    let text: ReadingText
    let handle: ReaderTextHandle
    @Binding var sheet: ReaderSheet?
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @Environment(AppPreferences.self) private var prefs
    @Environment(\.npTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var barHeight: CGFloat = 170

    var body: some View {
        let page = ReaderPage(background: prefs.readerBackground, theme: theme)
        ZStack {
            if model.mode == .pages, let doc = model.document {
                pages(doc)
            } else {
                surface(page)
                    .ignoresSafeArea(edges: .bottom)
            }
        }
        .overlay(alignment: .bottom) { bottomStack }
        .onChange(of: model.page) { _, p in model.pageTurned(to: p) }
        .task { launchChecks() }
    }

    /// Pages: the original PDF when the server has it, else its page images.
    @ViewBuilder
    private func pages(_ doc: NPDocument) -> some View {
        switch model.original {
        case .ready(let url):
            OriginalPDFView(url: url, page: $model.page, background: UIColor(theme.surfaceLow), bottomInset: barHeight + 24)
                .ignoresSafeArea(edges: .bottom)
        case .unavailable:
            PagesView(documentID: doc.id, pageCount: doc.pageCount ?? 0, page: $model.page, bottomInset: barHeight + 24)
        case .idle, .loading:
            ProgressView()
                .controlSize(.large)
                .tint(theme.accentText)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel("Getting the original pages")
                .task { await model.loadOriginal() }
        }
    }

    private func surface(_ page: ReaderPage) -> some View {
        ReaderTextSurface(
            text: text,
            style: ReaderTextStyle(
                bodyFont: theme.readerFontName(prefs.readerFont),
                headingFont: theme.fontName(.displaySemi),
                titleFont: theme.fontName(.display),
                equationFont: theme.fontName(.mono),
                size: CGFloat(prefs.readerFontSize),
                lineSpacing: CGFloat(prefs.readerLineSpacing),
                sizeCategory: UIContentSizeCategory(typeSize),
                page: page),
            word: model.cursor,
            showsCursor: model.cursorShown,
            playing: model.isPlaying,
            follow: prefs.followAlong,
            animates: theme.animates,
            bottomInset: barHeight + 18,
            scroll: model.scroll,
            flash: model.flash,
            recenter: model.recenter,
            handle: handle,
            onTapWord: { model.tap(word: $0) },
            onUserScroll: { model.scrolledByHand(top: $0, bottom: $1) },
            onFollowPaused: { model.followPaused = $0 },
            onAsk: { ask(about: $0) },
            onReadFrom: { model.move(to: $0, play: true) },
            onVoiceOverFocus: { model.pause() })
    }

    private var bottomStack: some View {
        VStack(spacing: 10) {
            if let notice = model.notice {
                NoticePill(text: notice)
                    .task(id: notice) {
                        try? await Task.sleep(for: .seconds(4))
                        if model.notice == notice { model.notice = nil }
                    }
            }
            if model.isPlaying, model.followPaused, model.mode == .text {
                Button { model.followVoice() } label: {
                    Label("Back to the voice", systemImage: "arrow.down.to.line")
                }
                .buttonStyle(ReaderChipStyle(selected: true))
                .readerPanel(radius: 22)
                .accessibilityHint("Scrolls to the word being read")
            }
            PlayerBar(
                state: playerState,
                onToggle: { model.togglePlay() },
                onSentence: { model.step(sentence: $0) },
                onParagraph: { model.step(paragraph: $0) },
                onSpeed: { prefs.wordsPerMinute = $0 },
                onChapters: { sheet = .chapters },
                onOptions: { sheet = .options },
                onReadWithVoiceOver: {
                    model.pause()
                    handle.focusForVoiceOver()
                })
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { barHeight = $0 }
        }
        .frame(maxWidth: 640)
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
    }

    private var playerState: PlayerState {
        let range = model.chapterRange
        let count = max(1, range.count)
        let inChapter = min(max(0, model.cursor - range.lowerBound), count)
        let fraction = Double(inChapter) / Double(count)
        let percent = ReaderCopy.percent(fraction)
        let left = max(0, range.upperBound - model.cursor)
        let wpm = prefs.wordsPerMinute
        var position = "\(percent)%"
        var spoken = "\(percent) percent"
        if let i = model.chapterIndex, text.chapters.indices.contains(i) {
            position += " · Ch \(i + 1)/\(text.chapters.count)"
            spoken += " through chapter \(i + 1) of \(text.chapters.count), \(text.chapters[i].title)"
        } else {
            spoken += " read"
        }
        return PlayerState(
            playing: model.isPlaying,
            position: position,
            positionSpoken: spoken,
            timeLeft: "\(ReaderCopy.listeningTime(words: left, wpm: wpm)) left",
            timeLeftSpoken: "\(ReaderCopy.listeningTimeSpoken(words: left, wpm: wpm)) left",
            fraction: fraction,
            wordsPerMinute: wpm,
            canStepBack: model.cursor > 0,
            canStepForward: model.cursor < text.words.count - 1)
    }

    /// "Ask about this" from a text selection: Ask opens and sends it.
    private func ask(about selection: String) {
        let excerpt = selection.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !excerpt.isEmpty else { return }
        let short = excerpt.count > 400 ? String(excerpt.prefix(400)) + "…" : excerpt
        ReaderInbox.shared.questions[model.documentID] = "Explain this passage in plain words: “\(short)”"
        nav.askOpen = true
    }

    /// Screenshot switches (mock mode only).
    private func launchChecks() {
        guard ReaderLaunch.isMock(session.api) else { return }
        if ReaderLaunch.readerMode == "pages", model.hasPages { model.setMode(.pages) }
        switch ReaderLaunch.sheet {
        case "chapters": sheet = .chapters
        case "options": sheet = .options
        default: break
        }
        if ReaderLaunch.readAloud, !model.isPlaying {
            ReadAloudPlayer.shared.apply(VoiceSettings(prefs, muted: true))
            model.togglePlay()
        }
    }
}

/// Shown while a document is still being ingested.
struct ProcessingView: View {
    @Environment(\.npTheme) private var theme
    let document: NPDocument?

    var body: some View {
        let status = document?.status ?? .pending
        let step = status.step ?? 1
        ReaderStateView(symbol: "hourglass", title: "Getting this ready",
                        message: "\(status.stageText), step \(step) of 4. It opens here by itself when it's ready — you can leave and come back.") {
            if status == .embedding, let progress = document?.progress {
                VStack(spacing: 6) {
                    ProgressView(value: min(1, max(0, progress)))
                        .tint(theme.accentFill)
                        .frame(maxWidth: 260)
                    Text("\(ReaderCopy.percent(progress))%")
                        .font(theme.font(.mono, size: 12, relativeTo: .caption))
                        .foregroundStyle(theme.onSurfaceVariant)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Indexing, \(ReaderCopy.percent(progress)) percent")
            } else {
                ProgressView().tint(theme.accentText)
            }
        }
    }
}

/// The reader's two-line title (document, then chapter and page).
struct ReaderTitle: View {
    @Environment(\.npTheme) private var theme
    let title: String
    let subtitle: String?

    var body: some View {
        VStack(spacing: 1) {
            Text(title)
                .font(theme.font(.displaySemi, size: 16, relativeTo: .headline))
                .foregroundStyle(theme.onSurface)
                .lineLimit(1)
            if let subtitle {
                Text(subtitle)
                    .font(theme.font(.body, size: 12, relativeTo: .caption))
                    .foregroundStyle(theme.onSurfaceVariant)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: 420)
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// A short message over the reader (it fades by itself).
struct NoticePill: View {
    @Environment(\.npTheme) private var theme
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "info.circle").foregroundStyle(theme.accentText).accessibilityHidden(true)
            Text(text)
                .font(theme.font(.bodyMedium, size: 14, relativeTo: .footnote))
                .foregroundStyle(theme.onSurface)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .readerPanel(radius: 18)
        .accessibilityElement(children: .combine)
        .onAppear { AccessibilityNotification.Announcement(text).post() }
    }
}
