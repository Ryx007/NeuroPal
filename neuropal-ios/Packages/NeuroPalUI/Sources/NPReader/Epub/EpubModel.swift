import Foundation
import NPCore
import Observation

/// An open EPUB: the manifest, the chapter on screen, its token stream and
/// read-aloud through the shared player, rolling into the next chapter at
/// the end — at once from words read ahead (EpubReadAhead), so it carries
/// on with the phone locked. Progress is (chapter + fraction) / chapters,
/// with the spine index in `lastPage` and the token in `lastWordIndex` (as
/// in the Expo app).
@MainActor
@Observable
final class EpubModel {
    struct TocItem: Identifiable, Hashable {
        let id: Int
        let title: String
        let depth: Int
        let spine: Int?
        let anchor: String?
    }

    let document: NPDocument
    private(set) var manifest: EpubManifest?
    private(set) var spine = 0
    private(set) var chapterURL: URL?
    private(set) var loadID = 0
    private(set) var tokens: EpubTokens?
    private(set) var word = 0
    private(set) var problem: String?
    /// Text selected in the page (offers "Ask about this").
    private(set) var selection: String?
    /// The runtime never reported tokens: show the page without read-aloud.
    private(set) var silent = false
    var notice: String?

    @ObservationIgnored let handler: EpubSchemeHandler
    @ObservationIgnored let bridge = EpubBridge()
    @ObservationIgnored let readAhead: EpubReadAhead
    /// The page shows the chapter in `spine` (its words came from it): only
    /// then does the highlight follow the voice.
    @ObservationIgnored private var pageReady = false
    @ObservationIgnored private(set) var pageAnchorsJSON = "[]"
    @ObservationIgnored private var pendingWord = 0
    /// Where in the next chapter to start, as a fraction, when only the
    /// overall progress is known (no saved chapter and word).
    @ObservationIgnored private var pendingFraction: Double?
    @ObservationIgnored private var pendingAnchor: String?
    /// The position moved since the last save.
    @ObservationIgnored private var dirty = false
    /// The progress last saved (or found on opening).
    @ObservationIgnored private var knownProgress: Double?
    @ObservationIgnored private var autoplay = false
    @ObservationIgnored private var api: (any NeuroPalAPI)?
    @ObservationIgnored private let saver = SaveScheduler()
    @ObservationIgnored private var watchdog: Task<Void, Never>?
    @ObservationIgnored let player = ReadAloudPlayer.shared

    init(document: NPDocument) {
        self.document = document
        let handler = EpubSchemeHandler()
        self.handler = handler
        readAhead = EpubReadAhead(handler: handler)
        bridge.onMessage = { [weak self] message in self?.handle(message) }
        saver.action = { [weak self] in await self?.saveNow() }
        handler.renewBase = { [weak self] in await self?.renewTicket() }
        handler.onMainDocumentFailed = { [weak self] web, error in
            guard let self, let web, web === self.bridge.webView else { return }
            self.chapterFailed(error)
        }
    }

    var isPlaying: Bool { player.isPlaying && player.isReading(document.id) }
    var chapterCount: Int { manifest?.spine.count ?? 0 }

    // MARK: Opening

    func open(api: any NeuroPalAPI) async {
        self.api = api
        guard manifest == nil else { return }
        problem = nil
        do {
            let m = try await api.epubManifest(documentID: document.id)
            let progress = try? await api.readingProgress(id: document.id)
            // The book's files load with this ticket (the page can't send
            // the session): without one nothing would show.
            let ticket = try await api.ticket(documentID: document.id)
            handler.base = Self.folder(api.epubBaseURL(documentID: document.id, ticket: ticket.ticket))
            manifest = m
            guard !m.spine.isEmpty else {
                problem = "This book has no chapters to show."
                return
            }
            let count = m.spine.count
            var start = min(max(0, progress?.lastPage ?? 0), count - 1)
            var word = max(0, progress?.lastWordIndex ?? 0)
            var fraction: Double?
            if progress?.lastPage == nil, let p = progress?.progress ?? document.readingProgress, p > 0.001, p < 0.999 {
                // Only the overall progress is known: estimate the chapter and the place in it.
                let x = p * Double(count)
                start = min(count - 1, Int(x))
                fraction = x - Double(start)
                word = 0
            }
            var fromPlayer = false
            if player.isReading(document.id), let id = player.scriptID, let hash = id.lastIndex(of: "#"),
               let si = Int(id[id.index(after: hash)...]), m.spine.indices.contains(si) {
                start = si
                word = player.word
                fraction = nil
                fromPlayer = true
            }
            knownProgress = progress?.progress ?? document.readingProgress
            go(to: start, word: word)
            pendingFraction = fraction
            if !fromPlayer {
                // Opening where the book was left changes nothing: save once the reader moves.
                saver.cancel()
                dirty = false
            }
        } catch is CancellationError {
        } catch {
            problem = ReaderCopy.problem(error)
        }
    }

    /// "Try again" after a problem: open the book again, or reload the chapter.
    func retry() async {
        problem = nil
        guard manifest != nil else {
            if let api { await open(api: api) }
            return
        }
        let w = word
        tokens = nil
        chapterURL = nil
        go(to: spine, word: w)
    }

    /// The server stopped taking the book's ticket (it lasts hours): a new
    /// one, and the folder it opens.
    private func renewTicket() async -> URL? {
        guard let api, let ticket = try? await api.ticket(documentID: document.id) else { return nil }
        return Self.folder(api.epubBaseURL(documentID: document.id, ticket: ticket.ticket))
    }

    /// The chapter on screen didn't load.
    private func chapterFailed(_ error: Error) {
        watchdog?.cancel()
        if player.isReading(document.id), player.scriptID == scriptID(spine) {
            // The voice reads it from the words read ahead: it carries on.
            notice = "This chapter's page didn't load. Reading aloud carries on."
            return
        }
        problem = Self.chapterProblem(error)
    }

    static func chapterProblem(_ error: Error) -> String {
        let offline: Set<URLError.Code> = [.notConnectedToInternet, .networkConnectionLost, .timedOut,
                                           .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed]
        if let e = error as? URLError, offline.contains(e.code) {
            return "You're offline right now. Try again when you're connected."
        }
        return "This chapter didn't load. Try again in a moment."
    }

    /// The folder URL with a trailing slash, so relative paths resolve inside it.
    static func folder(_ url: URL) -> URL {
        let s = url.absoluteString
        return s.hasSuffix("/") ? url : (URL(string: s + "/") ?? url)
    }

    /// Show a chapter (or an anchor in it); `autoplay` keeps the voice going.
    func go(to index: Int, word: Int = 0, anchor: String? = nil, autoplay: Bool = false) {
        guard manifest?.spine.indices.contains(index) == true else { return }
        if index == spine, tokens != nil, chapterURL != nil {
            if let anchor {
                // The page may still be loading this chapter (read ahead): it seeks once it's there.
                if pageReady { bridge.seekAnchor(anchor) } else { pendingAnchor = anchor }
            } else {
                seek(to: word, play: autoplay || isPlaying)
            }
            return
        }
        if !autoplay, isPlaying { player.pause() }
        tokens = nil
        pendingWord = word
        pendingFraction = nil
        pendingAnchor = anchor
        self.autoplay = autoplay
        show(chapter: index)
    }

    /// Load chapter `index` into the page.
    private func show(chapter index: Int) {
        guard let manifest, manifest.spine.indices.contains(index) else { return }
        spine = index
        selection = nil
        silent = false
        pageReady = false
        pageAnchorsJSON = anchorsJSON(index)
        chapterURL = EpubRuntime.url(for: manifest.spine[index].href)
        loadID += 1
        watch()
        saveSoon()
    }

    /// The print pages that start in chapter `index`, for the runtime.
    private func anchorsJSON(_ index: Int) -> String {
        guard let manifest, manifest.spine.indices.contains(index) else { return "[]" }
        let href = manifest.spine[index].href
        let anchors = manifest.pageList.filter { Self.samePath($0.href, href) }
            .map { ["page": $0.page, "anchor": $0.anchor ?? ""] }
        guard let data = try? JSONSerialization.data(withJSONObject: anchors),
              let json = String(data: data, encoding: .utf8) else { return "[]" }
        return json
    }

    /// The next two chapters, read ahead while the voice is in this book.
    private func readAheadNext() {
        guard let manifest, player.isReading(document.id) else { return }
        let next = (spine + 1)..<min(manifest.spine.count, spine + 3)
        readAhead.want(next.compactMap { i in
            EpubRuntime.url(for: manifest.spine[i].href)
                .map { EpubReadAhead.Chapter(spine: i, url: $0, pageAnchorsJSON: anchorsJSON(i)) }
        })
    }

    /// If the runtime never reports (scripts unavailable), show the page anyway.
    private func watch() {
        watchdog?.cancel()
        let id = loadID
        watchdog = Task { [weak self] in
            try? await Task.sleep(for: .seconds(6))
            guard let self, !Task.isCancelled, self.loadID == id, self.tokens == nil else { return }
            self.silent = true
        }
    }

    static func samePath(_ a: String, _ b: String) -> Bool {
        func clean(_ s: String) -> String {
            let path = s.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? s
            return path.removingPercentEncoding ?? path
        }
        return clean(a) == clean(b)
    }

    // MARK: Messages from the page

    private func handle(_ message: EpubMessage) {
        switch message {
        case .tokens(let t):
            watchdog?.cancel()
            pageReady = true
            silent = false
            if player.isReading(document.id), player.scriptID == scriptID(spine) {
                // The voice is in this chapter already (read ahead, or the
                // book reopened while it read): the page joins it.
                tokens = t
                pendingWord = 0
                pendingFraction = nil
                autoplay = false
                word = t.clamp(player.word)
                player.load(script(t), documentID: document.id, at: word)
                hook()
                if let anchor = pendingAnchor {
                    pendingAnchor = nil
                    bridge.seekAnchor(anchor)
                } else {
                    highlight(word, scroll: true)
                }
                readAheadNext()
                return
            }
            tokens = t
            let target = pendingFraction.map { Int($0 * Double(t.words.count)) } ?? pendingWord
            pendingWord = 0
            pendingFraction = nil
            let w = t.clamp(target)
            word = w
            if player.isReading(document.id) { hook() }
            if let anchor = pendingAnchor {
                pendingAnchor = nil
                bridge.seekAnchor(anchor)
            } else if w > 0 {
                highlight(w, scroll: true)
            }
            if autoplay {
                autoplay = false
                // A chapter without words (figures only) is passed over.
                if t.isEmpty { chapterFinished() } else { startVoice(from: w) }
            } else {
                readAheadNext()
            }
        case .tap(let i):
            seek(to: i, play: true)
        case .anchor(let i):
            seek(to: i, play: isPlaying)
        case .link(let href):
            follow(href)
        case .selection(let text):
            let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            selection = trimmed.isEmpty ? nil : trimmed
        }
    }

    private func follow(_ href: String) {
        guard let manifest, !href.isEmpty else { return }
        if href.hasPrefix("#") {
            bridge.seekAnchor(String(href.dropFirst()))
            return
        }
        guard let current = EpubRuntime.url(for: manifest.spine[spine].href),
              let target = URL(string: href, relativeTo: current)?.absoluteURL,
              target.scheme == EpubRuntime.scheme else {
            notice = "Links to websites don't open from inside a book."
            return
        }
        let path = EpubRuntime.path(of: target)
        guard let index = manifest.spine.firstIndex(where: { Self.samePath($0.href, path) }) else { return }
        go(to: index, anchor: target.fragment)
    }

    // MARK: Read aloud

    /// The player's name for chapter `index` of this book.
    private func scriptID(_ index: Int) -> String { "\(document.id)#\(index)" }

    private func script(_ t: EpubTokens) -> SpeechScript {
        let units = t.units
        return SpeechScript(id: scriptID(spine), speech: t.speech, units: units,
                            pauses: Array(repeating: 0.15, count: units.count), title: document.title,
                            subtitle: tocTitle)
    }

    func togglePlay() {
        guard let t = tokens, !t.isEmpty else { return }
        if isPlaying {
            player.pause()
            saveSoon()
            return
        }
        startVoice(from: word >= t.words.count - 1 ? 0 : word)
    }

    func pause() {
        if isPlaying { player.pause() }
    }

    private func startVoice(from w: Int) {
        guard let t = tokens, !t.isEmpty else { return }
        player.load(script(t), documentID: document.id, at: w)
        hook()
        player.play(from: w)
        readAheadNext()
    }

    private func hook() {
        player.onWord = { [weak self] w in self?.voiceMoved(to: w) }
        player.onFinish = { [weak self] in self?.chapterFinished() }
        player.onStep = { [weak self] forward in self?.step(paragraph: forward) }
    }

    private func voiceMoved(to w: Int) {
        word = w
        highlight(w, scroll: true)
        saveSoon()
    }

    /// Lights word `w` in the page — once the page shows this chapter.
    private func highlight(_ w: Int, scroll: Bool) {
        guard pageReady else { return }
        bridge.highlight(w, scroll: scroll)
    }

    private func chapterFinished() {
        let next = spine + 1
        guard next < chapterCount else {
            saveSoon()
            return
        }
        if let words = readAhead.tokens(for: next) {
            carryOn(into: next, with: words)
        } else {
            // Not read ahead (yet): the voice waits for the page, and the
            // audio session stays up meanwhile.
            player.expectMore()
            go(to: next, word: 0, autoplay: true)
        }
    }

    /// Straight on into chapter `index` from its words read ahead; the page
    /// loads it meanwhile (when it can) and the highlight joins in then.
    private func carryOn(into index: Int, with words: EpubTokens) {
        pendingWord = 0
        pendingFraction = nil
        pendingAnchor = nil
        autoplay = false
        show(chapter: index)
        tokens = words
        word = 0
        if words.isEmpty {
            chapterFinished() // figures only: on to the next one
        } else {
            startVoice(from: 0)
        }
    }

    func seek(to index: Int, play: Bool) {
        guard let t = tokens, !t.isEmpty else { return }
        let w = t.clamp(index)
        word = w
        highlight(w, scroll: false)
        if play {
            startVoice(from: w)
        } else if player.isReading(document.id) {
            player.seek(to: w)
        }
        saveSoon()
    }

    func step(sentence forward: Bool) {
        guard let t = tokens else { return }
        let target = forward ? (t.sentenceStart(after: word) ?? word) : t.sentenceStart(before: word)
        seek(to: target, play: isPlaying)
        if !isPlaying { highlight(target, scroll: true) }
    }

    func step(paragraph forward: Bool) {
        guard let t = tokens else { return }
        if forward, t.paragraphStart(after: word) == nil, spine + 1 < chapterCount {
            if isPlaying, let words = readAhead.tokens(for: spine + 1) {
                carryOn(into: spine + 1, with: words)
            } else {
                go(to: spine + 1, autoplay: isPlaying)
            }
            return
        }
        let target = forward ? (t.paragraphStart(after: word) ?? word) : t.paragraphStart(before: word)
        seek(to: target, play: isPlaying)
        if !isPlaying { highlight(target, scroll: true) }
    }

    func clearSelection() {
        selection = nil
        bridge.clearSelection()
    }

    /// A citation from Ask: found in this chapter, or explained.
    func show(_ citation: Citation) {
        guard let t = tokens else { return }
        if let excerpt = citation.excerpt, let i = t.index(matching: excerpt) {
            if isPlaying { player.pause() }
            word = i
            highlight(i, scroll: true)
            saveSoon()
        } else {
            notice = "That passage is in another chapter. Use Contents to get there."
        }
    }

    // MARK: Labels

    var tocItems: [TocItem] {
        guard let manifest else { return [] }
        var out: [TocItem] = []
        func walk(_ nodes: [EpubManifest.TocNode], depth: Int) {
            for node in nodes {
                let index = node.href.flatMap { href in manifest.spine.firstIndex { Self.samePath($0.href, href) } }
                let anchor = node.anchor ?? node.href.flatMap { $0.split(separator: "#", maxSplits: 1).dropFirst().first.map(String.init) }
                out.append(TocItem(id: out.count, title: node.title, depth: depth, spine: index, anchor: anchor))
                walk(node.children, depth: depth + 1)
            }
        }
        walk(manifest.toc, depth: 0)
        return out
    }

    var tocTitle: String? {
        var hit: String?
        for item in tocItems {
            guard let s = item.spine else { continue }
            if s <= spine { hit = item.title } else { break }
        }
        return hit
    }

    /// "Page 12 of 300" from the book's real page list (never invented).
    var pageLabel: String? {
        guard let manifest, let last = manifest.pageList.last?.page else { return nil }
        var current: String?
        if let t = tokens {
            for a in t.pageAnchors {
                if a.index <= word { current = a.page } else { break }
            }
        }
        if current == nil {
            for p in manifest.pageList {
                guard let si = manifest.spine.firstIndex(where: { Self.samePath($0.href, p.href) }) else { continue }
                if si < spine { current = p.page } else { break }
            }
        }
        return current.map { "Page \($0) of \(last)" }
    }

    var chapterFraction: Double {
        guard let t = tokens, t.words.count > 1 else { return 0 }
        return Double(word) / Double(t.words.count - 1)
    }

    var wordsLeft: Int { max(0, (tokens?.words.count ?? 0) - word) }

    // MARK: Saving

    func saveSoon() {
        dirty = true
        saver.soon()
    }

    /// Saves the position if it moved. `leaving` (the book closing, the app
    /// going to the background) also refreshes Continue reading.
    func saveNow(leaving: Bool = false) async {
        guard let api, chapterCount > 0, dirty || leaving else { return }
        guard dirty else {
            // Nothing moved since the last save (or since opening).
            ContinueReading.record(documentID: document.id, title: document.title, progress: knownProgress ?? 0, leaving: true)
            return
        }
        dirty = false
        let w: Int
        let fraction: Double
        if let t = tokens, !t.words.isEmpty {
            w = word
            let atEnd = spine == chapterCount - 1 && word >= t.words.count - 1
            fraction = atEnd ? 1 : Double(word) / Double(t.words.count)
        } else {
            // This chapter's words aren't known (still loading, or no read-aloud here).
            w = pendingWord
            fraction = pendingFraction ?? 0
        }
        let progress = min(1, max(0, (Double(spine) + fraction) / Double(chapterCount)))
        knownProgress = progress
        let update = ReadingProgressUpdate(progress: progress, lastWordIndex: w, lastPage: spine)
        ContinueReading.record(documentID: document.id, title: document.title, progress: progress, leaving: leaving)
        do {
            try await api.saveReadingProgress(id: document.id, update)
        } catch {
            dirty = true // try again with the next save
        }
    }
}
