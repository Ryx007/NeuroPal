import NPCore
import NPTheme
import SwiftUI
import UIKit

/// An EPUB, one spine chapter at a time, in the publisher's own layout —
/// with the reader's font, size and page colour on top, read-aloud with
/// word highlighting, the book's real contents and page numbers.
struct EpubReaderView: View {
    let document: NPDocument
    @Binding var sheet: ReaderSheet?
    /// Chapter or print page, for the reader's title.
    @Binding var subtitle: String?
    @Environment(AppSession.self) private var session
    @Environment(AppNavigator.self) private var nav
    @Environment(AppPreferences.self) private var prefs
    @Environment(\.npTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: EpubModel
    @State private var barHeight: CGFloat = 170
    @State private var contentsOpen = false

    init(document: NPDocument, sheet: Binding<ReaderSheet?>, subtitle: Binding<String?>) {
        self.document = document
        _sheet = sheet
        _subtitle = subtitle
        _model = State(initialValue: EpubModel(document: document))
    }

    private var page: ReaderPage { ReaderPage(background: prefs.readerBackground, theme: theme) }

    private var css: String {
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(typeSize))
        let size = UIFontMetrics(forTextStyle: .body).scaledValue(for: CGFloat(prefs.readerFontSize), compatibleWith: traits)
        return EpubRuntime.themeCSS(page: page, fontSize: size, lineSpacing: CGFloat(prefs.readerLineSpacing),
                                    bottomPadding: barHeight + 48)
    }

    var body: some View {
        ZStack {
            if let problem = model.problem {
                ReaderStateView(symbol: "book.closed", title: "This book won't open right now", message: problem) {
                    Button("Try again") { Task { await model.retry() } }
                        .buttonStyle(.npPrimary)
                        .accessibilityHint("Opens the book again")
                }
            } else {
                EpubWebView(model: model, background: page.uiBackground)
                    .ignoresSafeArea(edges: .bottom)
                    .accessibilityLabel("Book page")
                if model.tokens == nil, !model.silent {
                    ProgressView()
                        .controlSize(.large)
                        .tint(theme.accentText)
                        .accessibilityLabel("Opening the book")
                }
            }
        }
        .overlay(alignment: .bottom) {
            if model.problem == nil, model.tokens != nil || model.silent { bottomStack }
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { contentsOpen = true } label: { Label("Contents", systemImage: "list.bullet") }
                    .disabled(model.manifest == nil)
                Button { sheet = .options } label: { Label("Reading options", systemImage: "textformat.size") }
            }
        }
        .sheet(isPresented: $contentsOpen) {
            EpubContentsSheet(model: model)
                .npTheme(theme)
                .presentationDetents([.medium, .large])
                .presentationBackground(theme.surfaceContainer)
        }
        .task {
            model.handler.themeCSS = css
            model.handler.fontName = theme.readerFontName(prefs.readerFont)
            await model.open(api: session.api)
            if ReaderLaunch.isMock(session.api), ReaderLaunch.readAloud {
                ReadAloudPlayer.shared.apply(VoiceSettings(prefs, muted: true))
                for _ in 0..<40 where model.tokens == nil { try? await Task.sleep(for: .milliseconds(150)) }
                if !model.isPlaying { model.togglePlay() }
            }
        }
        .onChange(of: css) { _, next in
            model.handler.themeCSS = next
            model.bridge.setTheme(next)
        }
        .onChange(of: model.pageLabel ?? model.tocTitle, initial: true) { _, next in subtitle = next }
        .onChange(of: prefs.readerFont) { _, next in
            model.handler.fontName = theme.readerFontName(next)
        }
        .onChange(of: ReaderInbox.shared.citations[document.id]) { _, citation in
            guard let citation else { return }
            ReaderInbox.shared.citations[document.id] = nil
            model.show(citation)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { Task { await model.saveNow(leaving: phase == .background) } }
        }
        .onDisappear { Task { await model.saveNow(leaving: true) } }
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
            if model.silent {
                NoticePill(text: "Read-aloud isn't available for this chapter.")
            }
            if let selection = model.selection, document.isReady {
                Button {
                    let short = selection.count > 400 ? String(selection.prefix(400)) + "…" : selection
                    ReaderInbox.shared.questions[document.id] = "Explain this passage in plain words: “\(short)”"
                    model.clearSelection()
                    nav.askOpen = true
                } label: {
                    Label("Ask about the selection", systemImage: "sparkles")
                }
                .buttonStyle(ReaderChipStyle(selected: true))
                .readerPanel(radius: 22)
            }
            if let tokens = model.tokens, !tokens.isEmpty {
                PlayerBar(
                    state: playerState(tokens),
                    onToggle: { model.togglePlay() },
                    onSentence: { model.step(sentence: $0) },
                    onParagraph: { model.step(paragraph: $0) },
                    onSpeed: { prefs.wordsPerMinute = $0 },
                    onChapters: { contentsOpen = true },
                    onOptions: { sheet = .options },
                    onReadWithVoiceOver: { model.pause() })
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { barHeight = $0 }
            }
        }
        .frame(maxWidth: 640)
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
    }

    private func playerState(_ tokens: EpubTokens) -> PlayerState {
        let fraction = model.chapterFraction
        let percent = ReaderCopy.percent(fraction)
        let wpm = prefs.wordsPerMinute
        let count = max(1, model.chapterCount)
        let title = model.tocTitle
        return PlayerState(
            playing: model.isPlaying,
            position: "\(percent)% · Ch \(model.spine + 1)/\(count)",
            positionSpoken: "\(percent) percent through chapter \(model.spine + 1) of \(count)" + (title.map { ", \($0)" } ?? ""),
            timeLeft: "\(ReaderCopy.listeningTime(words: model.wordsLeft, wpm: wpm)) left",
            timeLeftSpoken: "\(ReaderCopy.listeningTimeSpoken(words: model.wordsLeft, wpm: wpm)) left in this chapter",
            fraction: fraction,
            wordsPerMinute: wpm,
            canStepBack: model.word > 0 || model.spine > 0,
            canStepForward: model.word < tokens.words.count - 1 || model.spine + 1 < count)
    }
}

/// The book's own contents (nested, indented) and its print pages.
struct EpubContentsSheet: View {
    @Environment(\.npTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    let model: EpubModel

    var body: some View {
        let items = model.tocItems
        let current = items.lastIndex { ($0.spine ?? Int.max) <= model.spine }
        NavigationStack {
            ScrollViewReader { proxy in
                List {
                    if let label = model.pageLabel {
                        Text(label)
                            .font(theme.font(.mono, size: 13, relativeTo: .footnote))
                            .foregroundStyle(theme.onSurfaceVariant)
                            .listRowBackground(theme.surfaceHigh)
                    }
                    Section {
                        if items.isEmpty {
                            Text("This book has no table of contents.")
                                .font(theme.bodyFont)
                                .foregroundStyle(theme.onSurfaceVariant)
                        }
                        ForEach(items) { item in
                            let isCurrent = item.id == current
                            Button {
                                if let s = item.spine { model.go(to: s, anchor: item.anchor) }
                                dismiss()
                            } label: {
                                HStack(spacing: 10) {
                                    Text(item.title)
                                        .font(theme.font(isCurrent ? .bodySemi : .body, size: 16, relativeTo: .body))
                                        .foregroundStyle(isCurrent ? theme.accentText : theme.onSurface)
                                        .multilineTextAlignment(.leading)
                                    Spacer(minLength: 8)
                                    if isCurrent {
                                        Text("You're here")
                                            .font(theme.font(.body, size: 12, relativeTo: .caption))
                                            .foregroundStyle(theme.onSurfaceVariant)
                                    }
                                }
                                .padding(.leading, CGFloat(min(item.depth, 4)) * 18)
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .disabled(item.spine == nil)
                            .listRowBackground(isCurrent ? theme.accent.opacity(0.12) : theme.surfaceHigh)
                            .accessibilityAddTraits(isCurrent ? .isSelected : [])
                            .id(item.id)
                        }
                    } header: {
                        SkinLabel("Contents")
                    }
                }
                .scrollContentBackground(.hidden)
                .background(theme.surfaceContainer)
                .onAppear { if let current { proxy.scrollTo(current, anchor: .center) } }
            }
            .navigationTitle(model.document.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
