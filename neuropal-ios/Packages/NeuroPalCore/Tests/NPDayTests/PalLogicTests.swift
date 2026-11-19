import Foundation
import Testing
@testable import NPDay

// Pal's offline brain (PalLogic.swift), ported from
// neuropal-expo-app/src/services/palAssistant.js.

private let utc: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    return c
}()

private func at(_ h: Int, _ m: Int) -> Date {
    utc.date(from: DateComponents(year: 2026, month: 10, day: 29, hour: h, minute: m))!
}

/// The repository root, from this file's path.
private let repo: URL = {
    var u = URL(fileURLWithPath: #filePath)
    for _ in 0..<6 { u.deleteLastPathComponent() }
    return u
}()

/// The source of `const CRISIS = /…/i;` in a JavaScript file.
private func crisisSource(_ relative: String) throws -> String {
    let text = try String(contentsOf: repo.appending(path: relative), encoding: .utf8)
    let decl = try #require(text.range(of: "const CRISIS ="))
    let open = try #require(text.range(of: "/", range: decl.upperBound..<text.endIndex))
    let close = try #require(text.range(of: "/i;", range: open.upperBound..<text.endIndex))
    return String(text[open.upperBound..<close.lowerBound])
}

// MARK: - Crisis safety net

@Test func theCrisisPatternIsTheServersByteForByte() throws {
    #expect(try crisisSource("neuropal-backend/src/routes/pal.js") == PalLogic.crisisPatternSource)
    #expect(try crisisSource("neuropal-expo-app/src/services/palAssistant.js") == PalLogic.crisisPatternSource)
    #expect(PalLogic.crisis.compiled, "the ICU translation compiles")
}

/// The phrases of neuropal-backend/test/pal.test.js.
@Test(arguments: [
    "i want to end it",
    "honestly i might kms tonight",
    "I took all my pills",
    "nobody would miss me if I was gone",
    "going to jump off the bridge tonight",
    "everyone is better off without me",
    "voglio morire",
    "non voglio più vivere",
    "quiero morirme",
    "je veux mourir",
    "ich will nicht mehr leben",
    "khudkushi",
    // the backend's route test (a curly apostrophe), and a few more
    "I don’t want to be alive anymore",
    "I want to kill myself",
    "I want to die",
    "thinking about suicide",
    "SELF-HARM again",
    "Mi voglio ammazzare... ammazzarmi",
    "aatmhatya",
])
func crisisPhrasesAreCaught(_ message: String) {
    #expect(PalLogic.soundsLikeCrisis(message), "\(message)")
}

@Test(arguments: [
    "this bug is killing me",
    "I walked 5 kms today",
    "let's end it here for today",
    "I take my meds at 8",
    "I am dying to read this paper",
    "killing time before class",
    // more everyday talk
    "ran 10.5 kms",
    "the movie's ending was sad",
    "",
])
func everydayTalkIsNotACrisis(_ message: String) {
    #expect(!PalLogic.soundsLikeCrisis(message), "\(message)")
}

// MARK: - Whitespace can't hide a crisis

/// The review's variants and more. Each one is a crisis on the server too:
/// pal.js tests `raw.replace(/\s+/g, ' ').trim()` (then ’ ‘ → ') — checked
/// with Node against the real pattern.
@Test(arguments: [
    "I want to  die", "kill  myself", "i want\tto die", "non voglio  vivere", "farla  finita", "wish i was dead",
    "I want to\u{A0}die", "kill\u{A0}myself", "I want\nto die", "kill\r\nmyself", "want\u{3000}to\u{3000}die",
    "end\u{2009}my\u{2009}life", "kill\u{FEFF}myself", "I\u{2028}want to die", "want\u{0B}to\u{0C}die",
    "  \t I want to die \n", "I don’t  want to live", "I don‘t\u{A0}want to be here", "take my\u{202F}own life",
    "can’t\u{205F}go on", "hang\u{1680}myself", "better off\u{200A}dead",
])
func whitespaceVariantsAreStillACrisis(_ message: String) {
    #expect(PalLogic.soundsLikeCrisis(message), "\(message.debugDescription)")
    if case .crisis = PalLogic.outgoing(message, max: PalLogic.messageMaxChars) {} else {
        Issue.record("Talk would send \(message.debugDescription)")
    }
}

@Test func onlyJavaScriptWhitespaceCollapses() {
    // The same expressions in Node give these (pal.js's cleaning).
    #expect(PalLogic.collapseWhitespace("  a \t\n b\u{3000}") == "a b")
    #expect(PalLogic.collapseWhitespace("\u{A0}x\u{A0}\u{A0}y\u{A0}") == "x y")
    #expect(PalLogic.collapseWhitespace("one\r\ntwo") == "one two")
    #expect(PalLogic.collapseWhitespace("x\u{2028}\u{2029}y") == "x y")
    #expect(PalLogic.collapseWhitespace("\u{FEFF}").isEmpty)
    #expect(PalLogic.collapseWhitespace("a\u{85}b") == "a\u{85}b", "U+0085 is not \\s in JavaScript")
    #expect(PalLogic.collapseWhitespace("a\u{200B}b") == "a\u{200B}b", "nor is a zero-width space")
    // …so these stay apart on the server too: not a crisis there, not here.
    #expect(!PalLogic.soundsLikeCrisis("kill\u{200B}myself"))
    #expect(!PalLogic.soundsLikeCrisis("kill\u{85}myself"))
    #expect(!PalLogic.soundsLikeCrisis("want to\u{180E}die"))
}

@Test func talkSendsWhatTheServerWouldSee() {
    let max = PalLogic.messageMaxChars
    #expect(PalLogic.outgoing(" \t\u{FEFF}\u{A0} ", max: max) == .nothing)
    #expect(PalLogic.outgoing("  hello\u{A0}\u{A0}there \n", max: max) == .send(text: "hello there"))
    #expect(PalLogic.outgoing("I want to  die", max: max) == .crisis(text: "I want to die"))
    // The cap counts UTF-16 units, like the server's String.length: 600 emoji are 1,200.
    #expect(PalLogic.outgoing(String(repeating: "😀", count: 600), max: max)
        == .send(text: String(repeating: "😀", count: 500)))
    // …it never cuts a character in half…
    #expect(PalLogic.outgoing(String(repeating: "a", count: 999) + "😀", max: max)
        == .send(text: String(repeating: "a", count: 999)))
    #expect(PalLogic.capUTF16("👩‍👩‍👧‍👦 and more", 5).isEmpty, "11 units: the family doesn't fit")
    #expect(PalLogic.outgoing("👩‍👩‍👧‍👦", max: 5) == .nothing, "never an empty message")
    // …and counts after collapsing: 2,000 spaces are one.
    #expect(PalLogic.outgoing("a" + String(repeating: " ", count: 2000) + "b", max: max) == .send(text: "a b"))
    // A cut never ends on the space before the next word.
    #expect(PalLogic.outgoing(String(repeating: "a", count: 999) + " b", max: max)
        == .send(text: String(repeating: "a", count: 999)))
    // The crisis check reads everything, even past the cap.
    if case .crisis = PalLogic.outgoing(String(repeating: "x", count: 1200) + " kill\tmyself", max: max) {} else {
        Issue.record("a crisis after the cap was missed")
    }
}

// MARK: - "Break it down" and a crisis

/// What reached "the server".
private final class ServerCalls: @unchecked Sendable {
    private let lock = NSLock()
    private var tasks: [String] = []
    func record(_ task: String) { lock.withLock { tasks.append(task) } }
    var all: [String] { lock.withLock { tasks } }
}

@Test(arguments: ["I want to end my life", "I want to  end my life", "kill\tmyself", "voglio\u{A0}morire",
                  "I don’t want to be here anymore"])
func aCrisisTaskIsNeverSentNorTurnedIntoSteps(_ task: String) async {
    let calls = ServerCalls()
    let out = await PalLogic.breakdown(task: task) { t in
        calls.record(t)
        return PalBreakdown(steps: ["Open it", "Do the first part", "Stop there"])
    }
    #expect(out == .crisis(reply: PalLogic.crisisReply))
    #expect(calls.all.isEmpty, "never sent")
    // Offline, or with the server failing, it's the same careful answer.
    let offline = await PalLogic.breakdown(task: task) { _ in throw APIError.offline }
    #expect(offline == .crisis(reply: PalLogic.crisisReply))
    let failing = await PalLogic.breakdown(task: task) { _ in throw APIError.server(status: 502, message: "no") }
    #expect(failing == .crisis(reply: PalLogic.crisisReply))
    #expect(PalLogic.quickBreakdown(task: task) == .crisis(reply: PalLogic.crisisReply))
}

@Test func theServersCrisisAnswerIsShownTheSameWay() async {
    let worded = await PalLogic.breakdown(task: "a task the server worries about") { _ in
        PalBreakdown(steps: [], crisis: true, reply: "  Careful\nwords.  ")
    }
    #expect(worded == .crisis(reply: "Careful words."))
    let bare = await PalLogic.breakdown(task: "another one") { _ in PalBreakdown(steps: [], crisis: true) }
    #expect(bare == .crisis(reply: PalLogic.crisisReply))
}

@Test func breakdownUsesTheServerThenSaysWhyItDidnt() async {
    let calls = ServerCalls()
    let good = await PalLogic.breakdown(task: "  write   the\tintro ") { t in
        calls.record(t)
        return PalBreakdown(steps: ["1. Open the file", "2) Write a line", "- Stop"])
    }
    #expect(good == .steps(["Open the file", "Write a line", "Stop"], note: nil))
    #expect(calls.all == ["write the intro"], "sent the way the server cleans it")
    let offlineSteps = PalLogic.offlineSteps(for: "write the intro")
    let bad = await PalLogic.breakdown(task: "write the intro") { _ in PalBreakdown(steps: ["One"]) }
    #expect(bad == .steps(offlineSteps, note: "The server’s steps didn’t come out right, so these are Pal’s offline steps."))
    let offline = await PalLogic.breakdown(task: "write the intro") { _ in throw APIError.offline }
    #expect(offline == .steps(offlineSteps, note: "No server right now, so these are Pal’s offline steps."))
    let signedOut = await PalLogic.breakdown(task: "write the intro") { _ in throw APIError.unauthorized }
    #expect(signedOut == .steps(offlineSteps, note: "You’re signed out, so these are Pal’s offline steps."))
    let empty = await PalLogic.breakdown(task: " \u{A0}\t") { _ in PalBreakdown(steps: []) }
    #expect(empty == nil)
    #expect(PalLogic.quickBreakdown(task: "write the intro") == .steps(offlineSteps, note: "Quick steps, made on this device."))
}

@Test func theSitNoticeKeepsTheTaskPrivate() {
    var pal = Appearance.Pal()
    pal.name = "Quark"
    let n = PalLogic.sitEndNotice(minutes: 25, pal: pal)
    #expect(n.title == "Quark: nice.")
    #expect(n.body == "That’s your 25 minutes. Want to note what you did?")
    #expect(PalLogic.sitEndNotice(minutes: 1, pal: pal).body == "That’s your 1 minute. Want to note what you did?")
}

@Test func javascriptMeaningsSurviveTheTranslation() {
    // \w and \b are ASCII in JavaScript: "ù" is not a word character there.
    #expect(!JSRegex(#"^\w+$"#).matches("più"))
    #expect(JSRegex(#"^\w+$"#).matches("piu_2"))
    #expect(JSRegex(#"\bvivere\b"#).matches("vivereà"))
    #expect(!JSRegex(#"\bkms\b"#).matches("akms"))
    #expect(JSRegex(#"^\d+\s\d+$"#).matches("12\u{00A0}34"), "JavaScript's \\s includes no-break space")
    #expect(!JSRegex(#"^\d$"#).matches("٣"), "\\d is ASCII digits only")
}

// MARK: - "What now?"

private let pal = Appearance.Pal()

@Test func overwhelmedGetsBodyFirst() {
    let list = PalLogic.suggestions(state: .red, now: at(10, 0), anchors: DayData.starter.anchors,
                                    tasks: DayData.starter.tasks, pal: pal, calendar: utc)
    #expect(list.map(\.id) == ["calm", "water", "sit-quiet"])
    #expect(list[0].action == .calm)
    #expect(list[0].title == "Take a 2-minute reset")
}

@Test func aBitOffGetsTheNextSmallThing() {
    let tasks = DayData.starter.tasks
    let list = PalLogic.suggestions(state: .yellow, now: at(15, 0), tasks: tasks, pal: pal, calendar: utc)
    #expect(list[0].id == "task:t1")
    #expect(list[0].title == "No rush. Want to try two minutes on “Take meds with breakfast”?")
    #expect(list[0].why == "You’re a bit off, so the next thing on today’s list. Two minutes counts.")
    #expect(list[0].action == .sit(minutes: 10, label: "Take meds with breakfast", taskID: "t1", anchorID: nil))
    #expect(list.map(\.id).suffix(2) == ["water", "dump"])

    let done = tasks.map { DayTask(id: $0.id, title: $0.title, done: true) }
    let empty = PalLogic.suggestions(state: .yellow, now: at(15, 0), tasks: done, pal: pal, calendar: utc)
    #expect(empty.map(\.id) == ["smallest", "water", "dump"])
}

@Test func anAnchorSoonShapesTheSuggestion() {
    let anchors = DayData.starter.anchors // 10:00 deep work
    let soon = PalLogic.suggestions(state: .green, now: at(9, 40), anchors: anchors, pal: pal, calendar: utc)
    #expect(soon[0].title == "One small thing before “Deep work block”")
    #expect(soon[0].why == "It starts in 20 min, so nothing big. I’ll call time 5 min before.")
    #expect(soon[0].action == .sit(minutes: 15, label: "Before Deep work block", taskID: nil, anchorID: "a2"))

    let now = PalLogic.suggestions(state: .green, now: at(9, 55), anchors: anchors, pal: pal, calendar: utc)
    #expect(now[0].title == "Get ready for “Deep work block”")
    #expect(now[0].why == "It starts in 5 min, at 10:00.")
    #expect(now[0].action == .ack)
}

@Test func okayOffersReadingThenTheList() {
    let reading = PalLogic.ReadingItem(id: "doc1", title: "Correlation plenoptic imaging with entangled photons",
                                       progress: 0.42)
    let list = PalLogic.suggestions(state: .green, now: at(15, 0), tasks: DayData.starter.tasks, reading: reading,
                                    pal: pal, calendar: utc)
    #expect(list[0].id == "read:doc1")
    #expect(list[0].title == "How about 25 minutes on “Correlation plenoptic imaging with…”?")
    #expect(list[0].why == "A good window for focus. You left off at 42%.")
    #expect(list[1].why == "Next on today’s list. Stop whenever it’s done.")
    #expect(list.last?.id == "water")
}

@Test func lateAtNightPalSuggestsStopping() {
    let list = PalLogic.suggestions(state: nil, now: at(23, 30), pal: pal, calendar: utc)
    #expect(list.map(\.id) == ["dump", "smallest", "water"])
    #expect(list[0].title == "Write down tomorrow’s first step, then stop")
    #expect(PalLogic.partOfDay(at(5, 59), calendar: utc) == .night)
    #expect(PalLogic.partOfDay(at(6, 0), calendar: utc) == .morning)
    #expect(PalLogic.partOfDay(at(18, 0), calendar: utc) == .evening)
}

@Test func theMostRecentlyReadUnfinishedDocument() {
    let docs = [
        NPDocument(id: "a", title: "Old", type: .pdf, status: .ready, readingProgress: 0.3, lastReadAt: at(8, 0)),
        NPDocument(id: "b", title: "Done", type: .pdf, status: .ready, readingProgress: 1, lastReadAt: at(12, 0)),
        NPDocument(id: "c", title: "Recent", type: .epub, status: .ready, readingProgress: 0.1, lastReadAt: at(11, 0)),
        NPDocument(id: "d", title: "Unopened", type: .pdf, status: .ready, readingProgress: 0),
    ]
    #expect(PalLogic.unfinishedReading(docs)?.id == "c")
    #expect(PalLogic.unfinishedReading([]) == nil)
}

@Test func palsWordsFollowTheTalkStyle() {
    var direct = Appearance.Pal()
    direct.talk = "Direct"
    #expect(PalLogic.palLine(direct, task: "“Walk”") == "Two minutes on “Walk”. Start now?")
    #expect(PalLogic.palLine(Appearance.Pal()) == "No rush. Want to try two minutes on the CPI notes?")
    #expect(PalLogic.hello(Appearance.Pal(), state: .red) == "I’m here. Nothing is needed right now.")
    #expect(PalLogic.hello(direct, state: nil) == "Here when you need me.")
    #expect(PalLogic.shorten("A title that is definitely much longer than forty-two characters") == "A title that is definitely much longer…")
    #expect(PalLogic.quoted("Short") == "“Short”")
}

// MARK: - "Break it down"

@Test func offlineStepsFitTheTask() {
    #expect(PalLogic.offlineSteps(for: "write the intro of my thesis").first == "Open the document")
    #expect(PalLogic.offlineSteps(for: "Read chapter 3").first == "Open the reading at your page")
    #expect(PalLogic.offlineSteps(for: "email my supervisor").first == "Open the message")
    #expect(PalLogic.offlineSteps(for: "phone the bank").first == "Find the number", "verbs first")
    #expect(PalLogic.offlineSteps(for: "the thing").first == "Get out what you need for it")
    for task in ["write", "read", "email", "call", "tidy my desk", "tax form", "cook dinner", "?"] {
        let steps = PalLogic.offlineSteps(for: task)
        #expect((PalLogic.stepsMin...PalLogic.stepsMax).contains(steps.count))
        #expect(steps.allSatisfy { $0.split(separator: " ").count <= PalLogic.stepMaxWords })
    }
}

@Test func serverStepsAreCleaned() {
    #expect(PalLogic.cleanSteps(["1. open the file", "2) Write a line", "- review it", "Step 4: rest"])
        == ["Open the file", "Write a line", "Review it", "Rest"])
    #expect(PalLogic.cleanSteps(["Do it", "do it!", "Next", "Last"]) == ["Do it", "Next", "Last"])
    #expect(PalLogic.cleanSteps([
        "Read the first section of the paper slowly and carefully with a pen and the notes", "B", "C",
    ])?.first == "Read the first section of the paper slowly and carefully")
    #expect(PalLogic.cleanSteps(["One", "Two"]) == nil)
    #expect(PalLogic.cleanSteps((1...9).map { "Thing \($0)" })?.count == PalLogic.stepsMax)
}

// MARK: - Talk

@Test func theChatContextHoldsOnlyWhatHelps() {
    var tasks = DayData.starter.tasks
    tasks[1].done = true
    var p = Appearance.Pal()
    p.name = "Quark"
    p.people = false
    let ctx = PalLogic.chatContext(state: .yellow, now: at(9, 50), anchors: DayData.starter.anchors, tasks: tasks,
                                   pal: p, calendar: utc)
    #expect(ctx.state == "yellow")
    #expect(ctx.localTime == "09:50")
    #expect(ctx.nextAnchor == PalChatContext.NextAnchor(title: "Deep work block", at: "10:00", inMinutes: 10))
    #expect(ctx.minimumDay == ["Take meds with breakfast", "Reply to one email"])
    #expect(ctx.palName == "Quark")
    #expect(ctx.talkStyle == "Gentle")
    #expect(ctx.people == false)
    #expect(PalLogic.chatContext(state: nil, now: at(23, 0), anchors: DayData.starter.anchors, calendar: utc).nextAnchor == nil)
}

@Test func helpLinesAreDialable() {
    #expect(HelpLines.all.map(\.number) == ["112", "02 2327 2327"])
    #expect(HelpLines.all.allSatisfy { $0.url != nil })
}
