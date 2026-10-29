import Foundation
import NPCore
import Observation

/// One open document in the reader: loading (and waiting out ingest), the
/// reading position, read-aloud through the shared player, jumps, and
/// saving progress (debounced ~2 s, plus on leave/background).
@MainActor
@Observable
final class ReaderModel {
    enum Phase: Equatable {
        case loading
        /// Still being ingested; the reader polls until it's ready.
        case processing
        case failed(String)
        case unavailable(String)
        /// Ready, but there's no text in it.
        case empty
        case text
        case epub
    }

    enum Mode: String {
        case text, pages
    }

    /// The original PDF (pdf/arxiv), downloaded on first use of Pages.
    enum Original: Equatable {
        case idle
        case loading
        case ready(URL)
        /// No original file: the server's page images are shown instead.
        case unavailable
    }

    let documentID: String
    private(set) var phase: Phase = .loading
    private(set) var document: NPDocument?
    private(set) var text: ReadingText?
    /// The reading position: the voice's word, or where reading starts next.
    private(set) var cursor = 0
    /// The position marker shows once there is a position worth marking.
    private(set) var cursorShown = false
    private(set) var mode: Mode = .text
    /// Original pages: the page in view.
    var page = 1
    private(set) var scroll: ReaderScroll?
    private(set) var flash: ReaderFlash?
    /// The reader scrolled away from the voice (the view stopped following for a moment).
    var followPaused = false
    private(set) var recenter = 0
    /// A short message shown over the reader (cleared by the view).
    var notice: String?
    private(set) var original: Original = .idle

    @ObservationIgnored private var api: (any NeuroPalAPI)?
    @ObservationIgnored private let saver = SaveScheduler()
    @ObservationIgnored private var savedWord = -1
    @ObservationIgnored private var counter = 0
    @ObservationIgnored private var reachedEnd = false
    @ObservationIgnored let player = ReadAloudPlayer.shared

    init(documentID: String) {
        self.documentID = documentID
        saver.action = { [weak self] in await self?.saveNow() }
    }

    var isPlaying: Bool { player.isPlaying && player.isReading(documentID) }
    var canAsk: Bool { document?.isReady ?? false }
    var hasPages: Bool { (document?.type.hasPageImages ?? false) && (document?.pageCount ?? 0) > 0 }

    private func nextID() -> Int {
        counter += 1
        return counter
    }

    // MARK: Opening

    func open(api: any NeuroPalAPI) async {
        self.api = api
        if text != nil || phase == .epub { return }
        phase = .loading
        do {
            let doc = try await api.document(id: documentID)
            document = doc
            if doc.type == .epub {
                phase = .epub
                return
            }
            if doc.status == .failed {
                phase = .failed(doc.failureText)
                return
            }
            if doc.status.isProcessing {
                phase = .processing
                await waitUntilReady(api)
                return
            }
            await loadText(api)
        } catch is CancellationError {
        } catch {
            phase = .unavailable(ReaderCopy.problem(error))
        }
    }

    func retry() async {
        guard let api else { return }
        phase = .loading
        await open(api: api)
    }

    private func waitUntilReady(_ api: any NeuroPalAPI) async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(3))
            if Task.isCancelled { return }
            guard let doc = try? await api.document(id: documentID) else { continue }
            document = doc
            if doc.status == .failed {
                phase = .failed(doc.failureText)
                return
            }
            if !doc.status.isProcessing {
                await loadText(api)
                return
            }
        }
    }

    private func loadText(_ api: any NeuroPalAPI) async {
        do {
            async let textRequest = api.documentText(id: documentID)
            async let progressRequest = api.readingProgress(id: documentID)
            let source = try await textRequest
            let progress = try? await progressRequest
            let id = documentID
            let fallback = document?.title ?? "Document"
            let built = await Task.detached(priority: .userInitiated) {
                ReadingText.build(source, documentID: id, fallbackTitle: fallback)
            }.value
            text = built
            guard !built.isEmpty else {
                phase = .empty
                return
            }
            resume(built, progress)
            phase = .text
            if let pending = ReaderInbox.shared.citations.removeValue(forKey: documentID) { show(pending) }
        } catch is CancellationError {
        } catch {
            phase = .unavailable(ReaderCopy.problem(error))
        }
    }

    private func resume(_ t: ReadingText, _ progress: ReadingProgress?) {
        if player.isReading(documentID) {
            cursor = t.clamp(player.word)
            cursorShown = true
            hook()
        } else if let w = progress?.lastWordIndex, w > 0 {
            cursor = t.clamp(w)
            cursorShown = true
        } else if let p = progress?.progress ?? document?.readingProgress, p > 0.001, p < 0.999 {
            cursor = t.clamp(Int(Double(t.words.count) * p))
            cursorShown = true
        } else {
            cursor = 0
        }
        savedWord = cursor
        if cursor > 0 { scroll = ReaderScroll(id: nextID(), word: cursor, anchor: .reading, animated: false) }
    }

    // MARK: Read aloud

    func togglePlay() {
        guard let text, !text.isEmpty else { return }
        if isPlaying {
            player.pause()
            saveSoon()
            return
        }
        var from = cursor
        if from >= text.words.count - 1 { from = 0 }
        cursor = from
        cursorShown = true
        reachedEnd = false
        attach(text)
        player.play(from: from)
    }

    func pause() {
        if isPlaying { player.pause() }
    }

    private func attach(_ text: ReadingText) {
        player.load(text.speechScript(subtitle: document?.subtitle), documentID: documentID, at: cursor)
        hook()
    }

    private func hook() {
        player.onWord = { [weak self] w in self?.voiceMoved(to: w) }
        player.onFinish = { [weak self] in self?.voiceFinished() }
        player.onStep = { [weak self] forward in self?.step(paragraph: forward) }
    }

    private func voiceMoved(to w: Int) {
        cursor = w
        saveSoon()
    }

    private func voiceFinished() {
        guard let text else { return }
        cursor = max(0, text.words.count - 1)
        reachedEnd = true
        Task { await saveNow(force: true) }
    }

    /// Move the reading position; `play` starts (or keeps) the voice there.
    func move(to word: Int, play: Bool) {
        guard let text else { return }
        let target = text.clamp(word)
        cursor = target
        cursorShown = true
        reachedEnd = false
        if play {
            attach(text)
            player.play(from: target)
        } else if player.isReading(documentID) {
            player.seek(to: target)
        }
        saveSoon()
    }

    /// A tapped word: read aloud from it.
    func tap(word: Int) {
        move(to: word, play: true)
    }

    func step(sentence forward: Bool) {
        guard let text else { return }
        let target = forward ? (text.sentenceStart(after: cursor) ?? cursor) : text.sentenceStart(before: cursor)
        stepped(to: target)
    }

    func step(paragraph forward: Bool) {
        guard let text else { return }
        let target = forward ? (text.blockStart(after: cursor) ?? cursor) : text.blockStart(before: cursor)
        stepped(to: target)
    }

    private func stepped(to target: Int) {
        let playing = isPlaying
        move(to: target, play: playing)
        if !playing { scroll = ReaderScroll(id: nextID(), word: target, anchor: .reading, animated: true) }
    }

    func jump(toChapter index: Int) {
        guard let text, text.chapters.indices.contains(index) else { return }
        let w = text.blocks[text.chapters[index].block].words.lowerBound
        move(to: w, play: isPlaying)
        if mode == .pages, let p = text.page(forWord: w) { page = p }
        scroll = ReaderScroll(id: nextID(), word: w, anchor: .top, animated: false)
    }

    func jump(toPage target: Int) {
        guard let text else { return }
        if mode == .pages {
            page = target
            return
        }
        guard let w = text.word(forPage: target) else { return }
        move(to: w, play: isPlaying)
        scroll = ReaderScroll(id: nextID(), word: w, anchor: .top, animated: false)
    }

    /// Re-centre on the voice now (the "Back to the voice" button).
    func followVoice() {
        followPaused = false
        recenter += 1
    }

    /// After a manual scroll while not listening: progress follows the page.
    func scrolledByHand(top: Int, bottom: Int) {
        guard !isPlaying, text != nil else { return }
        guard cursor < top || cursor > bottom else { return }
        cursor = top
        reachedEnd = false
        if player.isReading(documentID) { player.seek(to: top) }
        saveSoon()
    }

    // MARK: Citations

    /// Show the passage a citation points at: the excerpt if it's found,
    /// else its page, else its section.
    func show(_ citation: Citation) {
        guard let text else {
            ReaderInbox.shared.citations[documentID] = citation
            return
        }
        var target: Int?
        if let excerpt = citation.excerpt, !excerpt.isEmpty { target = text.word(matching: excerpt) }
        if target == nil, let p = citation.page { target = text.word(forPage: p) }
        if target == nil, let heading = citation.sectionHeading {
            let key = ReadingText.searchKey(heading)
            if let chapter = text.chapters.first(where: { ReadingText.searchKey($0.title) == key }) {
                target = text.blocks[chapter.block].words.lowerBound
            }
        }
        guard let target else {
            notice = "That passage isn't in the text view. Try the original pages."
            return
        }
        if mode == .pages {
            if let p = citation.page ?? text.page(forWord: target) { page = p }
            return
        }
        if isPlaying {
            player.pause()
            notice = "Paused so you can look at the passage."
        }
        cursor = target
        cursorShown = true
        scroll = ReaderScroll(id: nextID(), word: target, anchor: .reading, animated: true)
        flash = ReaderFlash(id: nextID(), block: text.block(ofWord: target))
        saveSoon()
    }

    // MARK: Text and pages

    /// Download the original PDF once (it backs the Pages view).
    func loadOriginal() async {
        guard original == .idle, hasPages, let api else { return }
        original = .loading
        do {
            original = .ready(try await api.downloadOriginalFile(documentID: documentID))
        } catch is CancellationError {
            original = .idle
        } catch {
            original = .unavailable
        }
    }

    func setMode(_ next: Mode) {
        guard next != mode else { return }
        guard let text else {
            mode = next
            return
        }
        if next == .pages {
            if let p = text.page(forWord: cursor) {
                page = p
            } else if let count = document?.pageCount, count > 0 {
                page = min(count, 1 + Int(Double(cursor) / Double(max(1, text.words.count)) * Double(count)))
            }
        } else if let w = text.word(forPage: page), text.page(forWord: cursor) != page {
            cursor = w
            cursorShown = true
            saveSoon()
        }
        if next == .text { scroll = ReaderScroll(id: nextID(), word: cursor, anchor: .reading, animated: false) }
        mode = next
    }

    /// Reading the original pages: the reading position follows the page in
    /// view (unless the voice is reading).
    func pageTurned(to p: Int) {
        guard mode == .pages, !isPlaying, let text, let w = text.word(forPage: p),
              text.page(forWord: cursor) != p else { return }
        cursor = w
        cursorShown = true
        reachedEnd = false
        if player.isReading(documentID) { player.seek(to: w) }
        saveSoon()
    }

    // MARK: Labels

    var chapterIndex: Int? { text?.chapterIndex(forWord: cursor) }

    var chapterTitle: String? {
        guard let text, let i = chapterIndex else { return nil }
        return text.chapters[i].title
    }

    /// Words of the current chapter (the whole text when it has none).
    var chapterRange: Range<Int> {
        guard let text else { return 0..<0 }
        guard let i = chapterIndex else {
            let firstChapter = text.chapters.first.map { text.blocks[$0.block].words.lowerBound } ?? text.words.count
            return 0..<max(1, firstChapter)
        }
        return text.wordRange(ofChapter: i)
    }

    var documentFraction: Double {
        guard let text, text.words.count > 1 else { return 0 }
        return reachedEnd ? 1 : Double(cursor) / Double(text.words.count - 1)
    }

    var currentPage: Int? { text?.page(forWord: cursor) }

    // MARK: Saving

    func saveSoon() {
        saver.soon()
    }

    /// Saves the position if it moved. `leaving` (the reader closing, the
    /// app going to the background) also refreshes Continue reading.
    func saveNow(force: Bool = false, leaving: Bool = false) async {
        guard let api, let text, !text.isEmpty else { return }
        let w = cursor
        let moved = force || w != savedWord
        guard moved || leaving else { return }
        let fraction = reachedEnd ? 1 : Double(w) / Double(max(1, text.words.count))
        let update = ReadingProgressUpdate(progress: min(1, max(0, fraction)), lastWordIndex: w,
                                           lastPage: text.page(forWord: w))
        ContinueReading.record(documentID: documentID, title: document?.title ?? text.title,
                               progress: update.progress, leaving: leaving)
        guard moved else { return }
        savedWord = w
        do {
            try await api.saveReadingProgress(id: documentID, update)
        } catch {
            savedWord = -1 // try again with the next save
        }
    }
}
