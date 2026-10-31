import Foundation
import NPCore

/// Pal's offline brain — a port of neuropal-expo-app/src/services/palAssistant.js.
/// Pure functions only, so every basic works without a server:
///   soundsLikeCrisis  the safety net that runs BEFORE any message leaves the device
///   outgoing          a Talk message or a task, checked and cleaned the way the server does
///   suggestions       "What now?": one next step for this moment, with a reason
///   breakdown         "Break it down": crisis check, then the server, then Pal's offline steps
///   offlineSteps      "Break it down" without the server (template steps)
///   cleanSteps        the same rules for steps that come from the server
///   chatContext       what Pal's chat may know about right now
/// Copy is short, kind and plain; Pal never diagnoses.
public enum PalLogic {
    // MARK: - Crisis safety net

    /// True when a message sounds like a crisis: the app answers with
    /// `crisisReply`, shows the calming steps and help lines, and never
    /// sends it to a model. A safety net, not a clinical test: it can miss
    /// things, and the app says so.
    ///
    /// The text is normalised exactly as the server does before its test
    /// (pal.js: `raw.replace(/\s+/g, ' ').trim()`, then ’ ‘ → '), so "want
    /// to  die", a tab or a pasted no-break space can't slip past it.
    public static func soundsLikeCrisis(_ text: String) -> Bool {
        crisis.matches(crisisCheckText(text))
    }

    /// The same careful answer as the server's CRISIS_REPLY.
    public static let crisisReply = "I’m really glad you told me. I can’t help with this on my own, and you deserve real "
        + "support right now. If you might act on these thoughts or you’re in danger, call your local emergency number "
        + "now, or go to someone you trust. The calming steps in the app are one tap away."

    static let crisis = JSRegex(crisisPatternSource, fallback: #"\b(suicid\w*|kill(?:ing)? my ?self|want(?:ed)? to die|end(?:ing)? my life)\b"#)

    /// What the server's crisis test sees: whitespace collapsed and trimmed,
    /// then the curly apostrophes ’ ‘ made straight (one UTF-16 unit each,
    /// mapped one by one like JavaScript's replace).
    static func crisisCheckText(_ text: String) -> String {
        var out = String.UnicodeScalarView()
        for u in collapseWhitespace(text).unicodeScalars {
            out.append(u == "\u{2019}" || u == "\u{2018}" ? "'" : u)
        }
        return String(out)
    }

    // MARK: - Text the way the server cleans it

    /// JavaScript's `\s` (and what `String.prototype.trim` removes): tab,
    /// line feed, vertical tab, form feed, carriage return, space, no-break
    /// space, U+1680, U+2000–U+200A, the line and paragraph separators,
    /// U+202F, U+205F, U+3000 and U+FEFF. An explicit set on purpose: Swift's
    /// and ICU's notions of whitespace differ (U+0085 is whitespace there,
    /// not in JavaScript).
    static func isJavaScriptSpace(_ u: Unicode.Scalar) -> Bool {
        switch u.value {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
            return true
        default:
            return false
        }
    }

    /// JavaScript's `s.replace(/\s+/g, ' ').trim()` (how pal.js cleans a
    /// message or a task): each run of whitespace becomes one space, and
    /// none is left at either end.
    public static func collapseWhitespace(_ text: String) -> String {
        var out = String.UnicodeScalarView()
        var gap = false
        for u in text.unicodeScalars {
            if isJavaScriptSpace(u) {
                gap = true
            } else {
                if gap && !out.isEmpty { out.append(" ") }
                gap = false
                out.append(u)
            }
        }
        return String(out)
    }

    /// At most `max` UTF-16 units — the server's `String.length` — cut
    /// between characters, never through one (an emoji stays whole or goes).
    public static func capUTF16(_ text: String, _ max: Int) -> String {
        guard text.utf16.count > max else { return text }
        var used = 0
        var end = text.startIndex
        for i in text.indices {
            let n = text[i].utf16.count
            if used + n > max { break }
            used += n
            end = text.index(after: i)
        }
        return String(text[..<end])
    }

    /// A Talk message or a task on its way to Pal's server.
    public enum Outgoing: Equatable, Sendable {
        /// Nothing to send (only whitespace).
        case nothing
        /// Sounds like a crisis: Pal answers on the device with
        /// `crisisReply`, and nothing is sent anywhere.
        case crisis(text: String)
        /// Send this: whitespace collapsed like the server, within its cap.
        case send(text: String)
    }

    /// Cleans `draft` the way the server will (`collapseWhitespace`, then at
    /// most `max` UTF-16 units) and runs the crisis check on all of it first.
    public static func outgoing(_ draft: String, max: Int) -> Outgoing {
        let full = collapseWhitespace(draft)
        guard !full.isEmpty else { return .nothing }
        var text = capUTF16(full, max)
        if text.hasSuffix(" ") { text.removeLast() } // a cut right after a space
        if soundsLikeCrisis(full) { return .crisis(text: text) }
        return text.isEmpty ? .nothing : .send(text: text)
    }

    // MARK: - Time

    public enum PartOfDay: String, Sendable {
        /// 22:00–05:59: no new deep work, wind down instead.
        case night
        case morning, afternoon, evening
    }

    public static func partOfDay(_ date: Date = Date(), calendar: Calendar = .current) -> PartOfDay {
        let h = calendar.component(.hour, from: date)
        if h < 6 || h >= 22 { return .night }
        if h < 12 { return .morning }
        if h < 18 { return .afternoon }
        return .evening
    }

    /// "Within 30 min" (the anchor rule) and how early Pal calls time before it.
    public static let anchorWindowMinutes = 30
    static let anchorLeadMinutes = 5

    /// "Sit with me" lengths.
    public static let sitLengths = [10, 25, 45]

    /// The first upcoming anchor starting within the next `window` minutes.
    public static func upcomingAnchor(_ anchors: [DayAnchor], now: Date = Date(), window: Int = anchorWindowMinutes,
                                      calendar: Calendar = .current) -> (anchor: DayAnchor, minutes: Int)? {
        anchors
            .filter { $0.status == .upcoming }
            .map { ($0, DayData.minutesUntil($0, now: now, calendar: calendar)) }
            .filter { $0.1 >= 0 && $0.1 <= window }
            .min { $0.1 < $1.1 }
            .map { (anchor: $0.0, minutes: $0.1) }
    }

    // MARK: - Words

    /// Long titles are cut at a word, never mid-word.
    public static func shorten(_ text: String, _ n: Int = 42) -> String {
        let t = DayData.clean(text, max: Int.max)
        guard t.count > n else { return t }
        let cut = String(t.prefix(n - 1))
        var base = cut
        if let space = cut.lastIndex(of: " "), cut.distance(from: cut.startIndex, to: space) > n / 2 {
            base = String(cut[..<space])
        }
        while let last = base.last, last.isWhitespace || ",;:–—-".contains(last) { base.removeLast() }
        return base + "…"
    }

    /// “A title”, shortened.
    public static func quoted(_ text: String) -> String { "“\(shorten(text))”" }

    /// Pal's line for a task in the user's talk style (palLine in
    /// packages/tokens: PAL_OPTIONS.talk), e.g. "No rush. Want to try two
    /// minutes on “Take meds”?". `task` is a complete phrase.
    public static func palLine(_ pal: Appearance.Pal, task: String = "the CPI notes") -> String {
        let talk = Tokens.data["palOptions"]?["talk"]
        let template = talk?[pal.talk]?.stringValue ?? talk?["Gentle"]?.stringValue ?? "Want to try two minutes on {task}?"
        guard let r = template.range(of: "{task}") else { return template }
        return template.replacingCharacters(in: r, with: task)
    }

    /// The greeting under Pal's name (helloFor).
    public static func hello(_ pal: Appearance.Pal, state: NervousState?) -> String {
        switch state {
        case .red: return Tokens.palSay(pal, "helloOver")
        case .yellow: return Tokens.palSay(pal, "helloOff")
        case .green: return Tokens.palSay(pal, "helloOkay")
        case nil: return Tokens.palSay(pal, "helloUnset")
        }
    }

    // MARK: - "What now?"

    public struct Suggestion: Hashable, Sendable, Identifiable {
        public enum Action: Hashable, Sendable {
            /// The calming steps.
            case calm
            /// "Sit with me" for `minutes`, optionally tied to a task or an anchor.
            case sit(minutes: Int, label: String, taskID: String?, anchorID: String?)
            /// Open the reader and sit with the user for a focus block.
            case read(documentID: String, minutes: Int, label: String)
            /// Another of Pal's tools.
            case open(PalTool)
            /// A plain "go for it".
            case ack
        }

        public let id: String
        public let title: String
        public let why: String
        public let action: Action

        public init(id: String, title: String, why: String, action: Action) {
            self.id = id
            self.title = title
            self.why = why
            self.action = action
        }
    }

    /// Something being read, for "What now?" and Home's Continue reading.
    public struct ReadingItem: Hashable, Sendable {
        public var id: String
        public var title: String
        /// Reading progress 0…1.
        public var progress: Double
        public var lastReadAt: Date?
        public var pageCount: Int?

        public init(id: String, title: String, progress: Double, lastReadAt: Date? = nil, pageCount: Int? = nil) {
            self.id = id
            self.title = title
            self.progress = progress
            self.lastReadAt = lastReadAt
            self.pageCount = pageCount
        }
    }

    /// The most recently read unfinished document (unfinishedReading).
    public static func unfinishedReading(_ documents: [NPDocument]) -> ReadingItem? {
        documents
            .filter { (($0.readingProgress ?? 0) > 0) && (($0.readingProgress ?? 0) < 1) }
            .max { ($0.lastReadAt ?? .distantPast) < ($1.lastReadAt ?? .distantPast) }
            .map { ReadingItem(id: $0.id, title: $0.title, progress: $0.readingProgress ?? 0, lastReadAt: $0.lastReadAt,
                               pageCount: $0.pageCount) }
    }

    /// The candidate next steps for this moment, best first. The sheet shows
    /// one; "Another" moves to the next (suggestionsFor).
    public static func suggestions(state: NervousState?, now: Date = Date(), anchors: [DayAnchor] = [],
                                   tasks: [DayTask] = [], reading: ReadingItem? = nil, pal: Appearance.Pal = .init(),
                                   calendar: Calendar = .current) -> [Suggestion] {
        let open = tasks.filter { !$0.done && !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let night = partOfDay(now, calendar: calendar) == .night
        var out: [Suggestion] = []
        func add(_ s: Suggestion) { if !out.contains(where: { $0.id == s.id }) { out.append(s) } }

        let water = Suggestion(id: "water", title: "Get a glass of water",
                               why: "Small and physical helps when your head is loud.", action: .ack)
        let dump = Suggestion(
            id: "dump",
            title: night ? "Write down tomorrow’s first step, then stop" : "Empty your head for two minutes",
            why: night ? "It’s late. Nothing big tonight; tomorrow can start from here."
                : "Getting thoughts out makes room to pick one.",
            action: .open(.dump))
        func smallStep(_ t: DayTask, _ why: String) -> Suggestion {
            Suggestion(id: "task:\(t.id)", title: palLine(pal, task: quoted(t.title)), why: why,
                       action: .sit(minutes: 10, label: t.title.trimmingCharacters(in: .whitespacesAndNewlines),
                                    taskID: t.id, anchorID: nil))
        }

        switch state {
        case .red:
            add(Suggestion(id: "calm", title: "Take a 2-minute reset",
                           why: "You said you’re overwhelmed. Body first; everything else can wait.", action: .calm))
            add(water)
            add(Suggestion(id: "sit-quiet", title: "Sit with me for 10 minutes", why: "No task. Just quiet company.",
                           action: .sit(minutes: 10, label: "", taskID: nil, anchorID: nil)))
            return out

        case .yellow:
            if night {
                add(Suggestion(id: dump.id, title: dump.title, why: "It’s late and you’re a bit off. Rest counts as a step.",
                               action: dump.action))
            }
            for (i, t) in open.enumerated() {
                add(smallStep(t, i == 0 ? "You’re a bit off, so the next thing on today’s list. Two minutes counts."
                                  : "Another small one from today’s list."))
            }
            if open.isEmpty {
                add(Suggestion(id: "smallest", title: "Pick the smallest thing you can do",
                               why: "Today’s list is done. If you want more, keep it tiny.", action: .open(.breakdown)))
            }
            add(water)
            add(dump)
            return out

        case .green, nil:
            // Okay, or not checked in yet (treated as okay; the panel offers a
            // check-in above the suggestion).
            if let soon = upcomingAnchor(anchors, now: now, calendar: calendar) {
                let a = soon.anchor
                let m = soon.minutes
                if m <= anchorLeadMinutes + 2 {
                    add(Suggestion(id: "anchor:\(a.id)", title: "Get ready for \(quoted(a.title))",
                                   why: m <= 0 ? "It’s at \(a.clock), right about now." : "It starts in \(m) min, at \(a.clock).",
                                   action: .ack))
                } else {
                    let sit = min(25, m - anchorLeadMinutes)
                    add(Suggestion(
                        id: "anchor:\(a.id)", title: "One small thing before \(quoted(a.title))",
                        why: "It starts in \(m) min, so nothing big. I’ll call time \(anchorLeadMinutes) min before.",
                        action: .sit(minutes: sit, label: "Before \(a.title.trimmingCharacters(in: .whitespacesAndNewlines))",
                                     taskID: nil, anchorID: a.id)))
                }
            }
            if night { add(dump) }
            if let reading {
                let pct = Int((min(1, max(0, reading.progress)) * 100).rounded())
                add(Suggestion(id: "read:\(reading.id)", title: Tokens.palSay(pal, "focus", ["task": quoted(reading.title)]),
                               why: "A good window for focus. You left off at \(pct)%.",
                               action: .read(documentID: reading.id, minutes: 25,
                                             label: "Reading \(reading.title.trimmingCharacters(in: .whitespacesAndNewlines))")))
            }
            for (i, t) in open.enumerated() {
                add(Suggestion(id: "task:\(t.id)", title: Tokens.palSay(pal, "focus", ["task": quoted(t.title)]),
                               why: i == 0 && reading == nil ? "A good window for focus. Stop whenever it’s done."
                                   : "Next on today’s list. Stop whenever it’s done.",
                               action: .sit(minutes: 25, label: t.title.trimmingCharacters(in: .whitespacesAndNewlines),
                                            taskID: t.id, anchorID: nil)))
            }
            add(dump)
            if open.isEmpty && reading == nil {
                add(Suggestion(id: "smallest", title: "Pick one small thing for today",
                               why: "Nothing is waiting. Break something down, or rest.", action: .open(.breakdown)))
            }
            add(water)
            return out
        }
    }

    // MARK: - "Break it down"

    public static let stepMaxWords = 12
    public static let stepsMin = 3
    public static let stepsMax = 7
    /// The server's TASK_MAX_CHARS, in UTF-16 units (its String.length).
    public static let taskMaxChars = 500

    private static let numbering = JSRegex(#"^\s*(?:step\s*)?(?:\d+|[a-z])[.):\]-]\s+"#)
    private static let bullet = JSRegex(#"^\s*[-*•·–—]+\s*"#)
    private static let trailingPunctuation = JSRegex(#"[,;:–—-]+$"#)
    /// A step cut at 12 words must not end on a dangling "and" / "the".
    private static let dangling = JSRegex(#"\s+(?:and|or|but|the|a|an|to|of|with|for|about|that|which|then|so)$"#)

    /// Server or template steps → 3–7 clean steps of ≤ 12 words (nil if
    /// fewer than 3 survive). Strips numbering/bullets, trailing filler and
    /// duplicates (cleanSteps).
    public static func cleanSteps(_ raw: [String]) -> [String]? {
        var out: [String] = []
        var seen = Set<String>()
        for item in raw {
            var s = DayData.clean(item, max: Int.max)
            s = numbering.replaceFirst(in: s, with: "")
            s = bullet.replaceFirst(in: s, with: "")
            s = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if s.isEmpty { continue }
            let words = s.split(whereSeparator: { $0.isWhitespace })
            if words.count > stepMaxWords {
                s = words.prefix(stepMaxWords).joined(separator: " ")
                s = trailingPunctuation.replaceFirst(in: s, with: "")
                while dangling.matches(s) { s = dangling.replaceFirst(in: s, with: "") }
            }
            s = s.prefix(1).uppercased() + s.dropFirst()
            let key = String(s.lowercased().unicodeScalars.filter { ("a"..."z").contains($0) || ("0"..."9").contains($0) }
                .map(Character.init))
            if key.isEmpty || seen.contains(key) { continue }
            seen.insert(key)
            out.append(s)
            if out.count == stepsMax { break }
        }
        return out.count >= stepsMin ? out : nil
    }

    // Checked in order, verbs first: "read the paper" is reading, "write the
    // paper" is writing. Ambiguous nouns alone ("the paper") get the generic one.
    private static let templates: [(match: JSRegex, steps: [String])] = [
        (JSRegex(#"\b(write|writing|draft|drafting|essay|report|thesis|blog|cv|cover letter|summari[sz]e)\b"#), [
            "Open the document",
            "Write one messy sentence, any sentence",
            "List three points you want to make",
            "Write the first point, badly is fine",
            "Take a two-minute break",
            "Write the next point",
            "Read it once and fix one thing",
        ]),
        (JSRegex(#"\b(read|reading|study|studying|revise|revision|review|learn|lecture|lectures|textbook|exam|exams)\b"#), [
            "Open the reading at your page",
            "Read only the headings first",
            "Read one section, nothing more",
            "Write one line about what it said",
            "Stretch for a minute",
            "Read the next section",
        ]),
        (JSRegex(#"\b(email|e-mail|mail|message|reply|text|letter|dm)\b"#), [
            "Open the message",
            "Write one sentence saying what you need",
            "Add one sentence of detail",
            "Read it once",
            "Send it as it is",
        ]),
        (JSRegex(#"\b(call|phone|ring)\b"#), [
            "Find the number",
            "Write one line about why you’re calling",
            "Pick a quiet spot",
            "Press call",
            "Say your line, then listen",
        ]),
        (JSRegex(#"\b(clean|cleaning|tidy|dishes|laundry|wash|washing|room|desk|kitchen|vacuum|hoover|bathroom)\b"#), [
            "Put on something to listen to",
            "Pick up five things and put them away",
            "Clear one surface",
            "Take the rubbish out",
            "Do five more minutes, then stop",
        ]),
        (JSRegex(#"\b(apply|application|form|forms|tax|taxes|bill|bills|paperwork|admin|insurance|bank|appointment)\b"#), [
            "Open the form or website",
            "Find the first box you can fill",
            "Fill in only the easy parts",
            "Write down what you’re missing",
            "Save it, even if it isn’t finished",
        ]),
        (JSRegex(#"\b(cook|cooking|dinner|lunch|breakfast|meal|food|groceries|shopping|shop)\b"#), [
            "Get out one pan or one bag",
            "Pick the simplest option you have",
            "Get the ingredients or the list ready",
            "Do the first step of the recipe",
            "Tidy one thing while you wait",
        ]),
    ]

    private static let generic = [
        "Get out what you need for it",
        "Do the first tiny part for two minutes",
        "Decide the next small piece",
        "Do that piece",
        "Check: done, or one more piece?",
    ]

    /// Template steps used when the server is unreachable (the app says
    /// so): picked by keywords, else a generic start-small sequence. Always
    /// 3–7 steps of ≤ 12 words; step one takes less than two minutes.
    public static func offlineSteps(for task: String) -> [String] {
        let hit = templates.first { $0.match.matches(task) }
        return cleanSteps(hit?.steps ?? generic) ?? generic
    }

    /// What "Break it down" shows.
    public enum BreakdownOutcome: Equatable, Sendable {
        /// The steps, and why they are Pal's offline ones (nil: the server's).
        case steps([String], note: String?)
        /// The task sounds like a crisis: no steps — Pal's careful answer,
        /// the calming steps and the help lines.
        case crisis(reply: String)
    }

    /// "Break it down" (requestBreakdown in palApi.js). Safety first, and
    /// offline: a task that sounds like a crisis is answered on the device
    /// and never sent, whether or not there is a server. Then the server;
    /// its own crisis answer (`crisis: true`) is shown the same way. When the
    /// server can't help, Pal's offline steps, saying why. Nil for an empty task.
    public static func breakdown(task draft: String,
                                 server: @Sendable (String) async throws -> PalBreakdown) async -> BreakdownOutcome? {
        let task: String
        switch outgoing(draft, max: taskMaxChars) {
        case .nothing: return nil
        case .crisis: return .crisis(reply: crisisReply)
        case .send(let text): task = text
        }
        do {
            let answer = try await server(task)
            if answer.crisis {
                let reply = collapseWhitespace(answer.reply ?? "")
                return .crisis(reply: reply.isEmpty ? crisisReply : reply)
            }
            if let steps = cleanSteps(answer.steps) { return .steps(steps, note: nil) }
            return .steps(offlineSteps(for: task),
                          note: "The server’s steps didn’t come out right, so these are Pal’s offline steps.")
        } catch {
            return .steps(offlineSteps(for: task), note: offlineNote(for: error))
        }
    }

    /// "Use quick steps now": Pal's offline steps without waiting — after the
    /// same crisis check.
    public static func quickBreakdown(task draft: String) -> BreakdownOutcome {
        if case .crisis = outgoing(draft, max: taskMaxChars) { return .crisis(reply: crisisReply) }
        return .steps(offlineSteps(for: collapseWhitespace(draft)), note: "Quick steps, made on this device.")
    }

    /// Why the steps are Pal's offline ones, said plainly (SOURCE_NOTE in PalSheet.jsx).
    public static func offlineNote(for error: Error) -> String {
        switch error as? APIError {
        case .offline?: return "No server right now, so these are Pal’s offline steps."
        case .rateLimited?: return "Pal has done a lot of thinking for now, so these are offline steps."
        case .unauthorized?: return "You’re signed out, so these are Pal’s offline steps."
        default:
            if (error as? URLError) != nil { return "No server right now, so these are Pal’s offline steps." }
            return "The server didn’t answer well, so these are Pal’s offline steps."
        }
    }

    // MARK: - Talk

    /// Chat context for POST /api/pal/chat — only what helps a short reply.
    public static func chatContext(state: NervousState?, now: Date = Date(), anchors: [DayAnchor] = [],
                                   tasks: [DayTask] = [], pal: Appearance.Pal = .init(),
                                   calendar: Calendar = .current) -> PalChatContext {
        let c = calendar.dateComponents([.hour, .minute], from: now)
        let pending = anchors
            .filter { $0.status == .upcoming }
            .map { ($0, DayData.minutesUntil($0, now: now, calendar: calendar)) }
            .filter { $0.1 >= 0 }
            .min { $0.1 < $1.1 }
        return PalChatContext(
            state: state?.rawValue,
            localTime: String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0),
            nextAnchor: pending.map { .init(title: String($0.0.title.prefix(80)), at: $0.0.clock, inMinutes: $0.1) },
            minimumDay: Array(tasks.filter { !$0.done }.map { String($0.title.prefix(80)) }.filter { !$0.isEmpty }.prefix(8)),
            palName: pal.name,
            talkStyle: pal.talk,
            people: pal.people)
    }

    /// Talk's message limit (the server's MESSAGE_MAX_CHARS), in UTF-16
    /// units (its String.length), counted after whitespace is collapsed.
    public static let messageMaxChars = 1000

    // MARK: - Sit with me

    /// The notification at the end of a "Sit with me" block (startSit in
    /// sitControl.js). No task words in it: it can show on a locked screen.
    public static func sitEndNotice(minutes: Int, pal: Appearance.Pal) -> (title: String, body: String) {
        ("\(pal.name): nice.", "That’s your \(minutes) \(minutes == 1 ? "minute" : "minutes"). Want to note what you did?")
    }
}

/// A JavaScript regular expression (non-unicode mode, flag `i`) run with
/// NSRegularExpression: `\b`, `\w`, `\d` and `\s` keep their JavaScript
/// meaning (ASCII word characters and digits, JavaScript's whitespace set),
/// so a pattern copied from the server matches exactly what it matches there.
final class JSRegex: @unchecked Sendable {
    // NSRegularExpression is immutable and documented as thread-safe.
    private let regex: NSRegularExpression

    init(_ source: String, fallback: String? = nil) {
        if let r = try? NSRegularExpression(pattern: JSRegex.icuPattern(source), options: [.caseInsensitive]) {
            regex = r
        } else if let fallback, let r = try? NSRegularExpression(pattern: JSRegex.icuPattern(fallback),
                                                                 options: [.caseInsensitive]) {
            regex = r
        } else {
            // Never reached with the patterns in this file (the tests compile them all).
            regex = try! NSRegularExpression(pattern: "(?!)")
        }
    }

    var compiled: Bool { regex.pattern != "(?!)" }

    func matches(_ s: String) -> Bool {
        regex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    func replaceFirst(in s: String, with replacement: String) -> String {
        guard let m = regex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
              let r = Range(m.range, in: s) else { return s }
        return s.replacingCharacters(in: r, with: replacement)
    }

    private static let word = "A-Za-z0-9_"
    /// JavaScript's \s.
    private static let space = #"\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}"#

    /// JavaScript source → ICU pattern with the same meaning. Case-folding is
    /// switched off inside the ASCII classes so ICU's wider folding (ſ, K)
    /// can't widen them.
    static func icuPattern(_ js: String) -> String {
        let chars = Array(js)
        var out = ""
        var inClass = false
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if c == "\\", i + 1 < chars.count {
                let n = chars[i + 1]
                switch (n, inClass) {
                case ("b", false):
                    out += "(?-i:(?:(?<=[\(word)])(?![\(word)])|(?<![\(word)])(?=[\(word)])))"
                case ("B", false):
                    out += "(?-i:(?:(?<=[\(word)])(?=[\(word)])|(?<![\(word)])(?![\(word)])))"
                case ("w", false): out += "(?-i:[\(word)])"
                case ("W", false): out += "(?-i:[^\(word)])"
                case ("w", true): out += word
                case ("d", false): out += "[0-9]"
                case ("D", false): out += "[^0-9]"
                case ("d", true): out += "0-9"
                case ("s", false): out += "[\(space)]"
                case ("S", false): out += "[^\(space)]"
                case ("s", true): out += space
                default:
                    out.append(c)
                    out.append(n)
                }
                i += 2
                continue
            }
            if c == "[", !inClass {
                inClass = true
            } else if c == "]", inClass {
                inClass = false
            }
            out.append(c)
            i += 1
        }
        return out
    }
}
