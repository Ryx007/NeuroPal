import Foundation
import Testing
@testable import NPDay

// The day's rules (DayRules.swift), ported from the Expo app's homeSlice.js
// and palSlice.js, and the store/file around them.

private let utc: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    return c
}()

/// 2026-10-29 at hh:mm UTC.
private func at(_ h: Int, _ m: Int, day: Int = 29) -> Date {
    utc.date(from: DateComponents(year: 2026, month: 10, day: day, hour: h, minute: m))!
}

private func tempURL(_ name: String = "day.json") -> URL {
    let dir = FileManager.default.temporaryDirectory.appending(path: "npday-\(UUID().uuidString)", directoryHint: .isDirectory)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appending(path: name)
}

// MARK: - The slider scale

@Test func sliderRegions() {
    #expect(NervousState.forLevel(0) == .green)
    #expect(NervousState.forLevel(0.5) == .yellow)
    #expect(NervousState.forLevel(1) == .red)
    for s in NervousState.allCases { #expect(NervousState.forLevel(s.middleLevel) == s) }
}

@Test func regionEdgesAgreeWithTheNumberShown() {
    // 0–33 okay, 34–66 bit off, 67–100 overwhelmed (REGION_EDGES 0.335 / 0.665)
    #expect(NervousState.forLevel(0.33) == .green)
    #expect(NervousState.forLevel(0.34) == .yellow)
    #expect(NervousState.forLevel(0.66) == .yellow)
    #expect(NervousState.forLevel(0.67) == .red)
    #expect(NervousState.forLevel(-3) == .green)
    #expect(NervousState.forLevel(7) == .red)
    #expect(NervousState.forLevel(.nan) == .green)
    #expect(NervousState.value(0.336) == 34)
}

@Test func sliderLevelFollowsTheStoredCheckIn() {
    #expect(NervousState.sliderLevel(state: nil, level: 0.4) == nil)
    #expect(NervousState.sliderLevel(state: .yellow, level: 0.42) == 0.42)
    // a level that disagrees with the state → the middle of the state's region
    #expect(NervousState.sliderLevel(state: .red, level: 0.1) == 0.83)
    #expect(NervousState.sliderLevel(state: .green, level: nil) == 0.17)
}

@Test func voiceOverStepsThroughTheThreeStates() {
    #expect(NervousState.green.next == .yellow)
    #expect(NervousState.yellow.next == .red)
    #expect(NervousState.red.next == nil)
    #expect(NervousState.red.previous == .yellow)
    #expect(NervousState.green.previous == nil)
}

// MARK: - Check-ins

@Test func checkInsWithinAMinuteRefineTheLastOne() {
    var d = DayData()
    let t = at(9, 0)
    d.recordCheckIn(.green, level: 0.1, at: t, now: t)
    d.recordCheckIn(.yellow, level: 0.4, at: t.addingTimeInterval(30), now: t.addingTimeInterval(30))
    #expect(d.checkins.count == 1)
    #expect(d.state == .yellow)
    #expect(d.level == 0.4)
    d.recordCheckIn(.red, at: t.addingTimeInterval(95), now: t.addingTimeInterval(95))
    #expect(d.checkins.count == 2)
    #expect(d.state == .red)
    #expect(d.level == nil) // a button check-in: the knob rests mid-region
    #expect(d.sliderLevel == 0.83)
}

@Test func anOlderCheckInJoinsTheHistoryInTimeOrder() {
    var d = DayData()
    let t = at(12, 0)
    d.recordCheckIn(.green, at: at(8, 0), now: t)
    d.recordCheckIn(.red, at: at(11, 0), now: t)
    // a widget tap from 10:00 that the app hears about later
    d.recordCheckIn(.yellow, at: at(10, 0), now: t)
    #expect(d.checkins.map(\.state) == [.green, .yellow, .red])
    #expect(d.state == .red, "the newer state stays")
}

@Test func aCheckInIsNeverInTheFuture() {
    var d = DayData()
    let now = at(9, 0)
    let c = d.recordCheckIn(.green, at: now.addingTimeInterval(3600), now: now)
    #expect(c.at == now)
}

@Test func checkInHistoryIsCapped() {
    var d = DayData()
    let start = at(0, 0, day: 1)
    for i in 0..<(DayData.checkinCap + 5) {
        let t = start.addingTimeInterval(TimeInterval(i * 120))
        d.recordCheckIn(i.isMultiple(of: 2) ? .green : .yellow, at: t, now: t)
    }
    #expect(d.checkins.count == DayData.checkinCap)
    #expect(d.checkins.first?.at == start.addingTimeInterval(5 * 120))
}

@Test func levelsAreCleaned() {
    var d = DayData()
    d.recordCheckIn(.red, level: 1.7, at: at(9, 0), now: at(9, 0))
    #expect(d.level == 1)
    d.recordCheckIn(.green, level: .nan, at: at(9, 5), now: at(9, 5))
    #expect(d.level == nil)
}

@Test func checkInsOfOneDay() {
    var d = DayData()
    d.recordCheckIn(.green, at: at(23, 0, day: 28), now: at(9, 0))
    d.recordCheckIn(.yellow, at: at(8, 0), now: at(9, 0))
    #expect(d.checkins(on: at(12, 0), calendar: utc).map(\.state) == [.yellow])
}

// MARK: - A new day

@Test func aNewDayUnchecksTasksAndResetsAnchors() {
    var d = DayData.starter
    d.dayStamp = "2026-10-28"
    d.tasks[0].done = true
    d.anchors[0].status = .done
    d.anchors[1].status = .skipped
    let rolled = d.rollOver(now: at(8, 0), calendar: utc)
    #expect(rolled)
    #expect(d.dayStamp == "2026-10-29")
    #expect(d.tasks.allSatisfy { !$0.done })
    #expect(d.anchors.allSatisfy { $0.status == .upcoming })
    let again = d.rollOver(now: at(9, 0), calendar: utc)
    #expect(!again, "same day: nothing changes")
}

// MARK: - Minimum viable day

@Test func theMinimumDayHoldsUpToFiveThings() {
    var d = DayData.starter
    #expect(d.tasks.count == 3)
    let added = d.addTask("  Walk   outside ")
    #expect(added)
    #expect(d.tasks.last?.title == "Walk outside")
    let empty = d.addTask("   ")
    #expect(!empty)
    let fifth = d.addTask("Eat lunch")
    #expect(fifth)
    #expect(!d.canAddTask)
    let sixth = d.addTask("A sixth thing")
    #expect(!sixth)
    #expect(d.tasks.count == DayData.taskCap)
    let id = d.tasks[0].id
    d.toggleTask(id)
    #expect(d.tasks[0].done)
    #expect(d.remainingTasks == 4)
    d.renameTask(id, to: "  Meds  ")
    #expect(d.tasks[0].title == "Meds")
    d.renameTask(id, to: "  ")
    #expect(d.tasks[0].title == "Meds", "an empty name is ignored")
    d.removeTask(id)
    #expect(d.tasks.count == 4)
    #expect(d.canAddTask)
}

// MARK: - Anchors

@Test func anchorsAreCleanedAndKeptInTimeOrder() {
    var d = DayData.starter
    d.saveAnchor(DayAnchor(id: "n1", title: "  Evening meds ", hour: 25, minute: 70, flexMinutes: 999, category: "medication",
                           status: .done))
    let a = d.anchors.first { $0.id == "n1" }
    #expect(a?.title == "Evening meds")
    #expect(a?.hour == 23)
    #expect(a?.minute == 59)
    #expect(a?.flexMinutes == 240)
    #expect(a?.status == .upcoming, "a new anchor starts as upcoming")
    #expect(d.anchors.map(\.minuteOfDay) == d.anchors.map(\.minuteOfDay).sorted())
    d.saveAnchor(DayAnchor(id: "x", title: "   ", hour: 9, minute: 0))
    #expect(!d.anchors.contains { $0.id == "x" }, "a title is required")

    // an edit keeps the status and re-sorts
    d.setAnchor("a1", status: .done)
    var a1 = d.anchors.first { $0.id == "a1" }!
    a1.hour = 22
    d.saveAnchor(a1)
    #expect(d.anchors.first { $0.id == "a1" }?.status == .done)
    #expect(d.anchors.last?.id == "n1")
    #expect(d.anchors.dropLast().last?.id == "a1")
    d.removeAnchor("a1")
    #expect(!d.anchors.contains { $0.id == "a1" })
}

@Test func theNextAnchorStaysUntilItsWindowCloses() {
    var d = DayData.starter // 08:30 (±15), 10:00 (±30), 13:00, 21:30
    #expect(d.nextAnchor(now: at(7, 0), calendar: utc)?.id == "a1")
    #expect(d.nextAnchor(now: at(8, 44), calendar: utc)?.id == "a1")
    #expect(d.nextAnchor(now: at(8, 46), calendar: utc)?.id == "a2")
    #expect(d.nextAnchor(now: at(10, 25), calendar: utc)?.id == "a2")
    d.setAnchor("a2", status: .done)
    #expect(d.nextAnchor(now: at(10, 25), calendar: utc)?.id == "a3")
    d.setAnchor("a3", status: .skipped)
    #expect(d.nextAnchor(now: at(10, 25), calendar: utc)?.id == "a4")
    #expect(d.anchorsAfterNext(now: at(7, 0), calendar: utc).map(\.id) == ["a4"])
    #expect(d.nextAnchor(now: at(23, 0), calendar: utc) == nil)
    #expect(DayData.minutesUntil(d.anchors[0], now: at(8, 0), calendar: utc) == 30)
}

@Test func anchorCategoriesHaveWordsAndSymbols() {
    #expect(AnchorCategory.of("medication").label == "Meds")
    #expect(AnchorCategory.of("wind-down").symbol == "moon.stars.fill")
    #expect(AnchorCategory.of("evening").label == "Evening", "older saves still read")
    #expect(AnchorCategory.of("nonsense").id == "custom")
}

// MARK: - Brain dump

@Test func theBrainDumpKeepsNewestFirst() {
    var d = DayData()
    let first = d.addDump("  first   thought ")
    #expect(first != nil)
    let blank = d.addDump("\n ")
    #expect(blank == nil)
    let second = d.addDump("second")!
    #expect(d.dump.map(\.text) == ["second", "first thought"])
    let removed = d.removeDump(second.id)
    #expect(removed == second)
    d.restoreDump(second)
    d.restoreDump(second)
    #expect(d.dump.map(\.text) == ["second", "first thought"])
    for i in 0..<(DayData.dumpCap + 3) { d.addDump("line \(i)") }
    #expect(d.dump.count == DayData.dumpCap)
    #expect(d.dump.first?.text == "line \(DayData.dumpCap + 2)")
}

// MARK: - Sit with me

@Test func aSitChecksInHalfwayAndEndsKindly() {
    var d = DayData()
    let t0 = at(14, 0)
    let s = d.startSit(minutes: 25, label: "  Intro  ", now: t0)
    #expect(s.label == "Intro")
    #expect(s.endsAt == t0.addingTimeInterval(25 * 60))
    #expect(s.checkInTimes == [t0.addingTimeInterval(12.5 * 60)])
    let early = d.tickSit(now: t0.addingTimeInterval(5 * 60))
    #expect(early == nil)
    let half = d.tickSit(now: t0.addingTimeInterval(13 * 60))
    #expect(half == .checkInAsked)
    #expect(d.sit?.checkIn == .asked)
    let once = d.tickSit(now: t0.addingTimeInterval(13 * 60 + 1))
    #expect(once == nil, "asked once")
    d.answerSitCheckIn(.yes)
    #expect(d.sit?.checkIn == .yes)
    let end = d.tickSit(now: t0.addingTimeInterval(26 * 60))
    #expect(end == .ended)
    #expect(d.sit?.endReason == .time)
    #expect(d.sit?.endedAt == s.endsAt)
    #expect(d.sit?.minutesSpent == 25)
    // nobody answered "note it?" for half an hour → it goes quietly
    let waiting = d.tickSit(now: s.endsAt.addingTimeInterval(29 * 60))
    #expect(waiting == nil)
    let forgot = d.tickSit(now: s.endsAt.addingTimeInterval(31 * 60))
    #expect(forgot == .forgotten)
    #expect(d.sit == nil)
}

@Test func longSitsCheckInEveryFifteenMinutes() {
    var d = DayData()
    let t0 = at(9, 0)
    let s = d.startSit(minutes: 45, now: t0)
    #expect(s.checkInTimes == [t0.addingTimeInterval(15 * 60), t0.addingTimeInterval(30 * 60)])
    let short = d.startSit(minutes: 1, now: t0)
    #expect(short.checkInTimes.isEmpty, "never in the last minute")
}

@Test func stoppingASitCountsTheTimeSpent() {
    var d = DayData()
    let t0 = at(9, 0)
    d.startSit(minutes: 25, now: t0)
    d.endSit(.done, now: t0.addingTimeInterval(10 * 60))
    #expect(d.sit?.endReason == .done)
    #expect(d.sit?.minutesSpent == 10)
    #expect(d.sit?.leftLabel(at: t0.addingTimeInterval(10 * 60)) == "15 min left")
    d.saveSitNote("  Wrote the outline ", now: t0.addingTimeInterval(11 * 60))
    #expect(d.sit == nil)
    #expect(d.sitNotes.first?.note == "Wrote the outline")
    #expect(d.sitNotes.first?.minutes == 10)
    d.startSit(minutes: 10, now: t0)
    d.saveSitNote("   ")
    #expect(d.sit == nil)
    #expect(d.sitNotes.count == 1, "an empty note just clears")
}

@Test func sitLabels() {
    let t0 = at(9, 0)
    let s = SitSession(minutes: 25, startedAt: t0, endsAt: t0.addingTimeInterval(25 * 60))
    #expect(s.leftLabel(at: t0) == "25 min left")
    #expect(s.leftLabel(at: t0.addingTimeInterval(24 * 60 + 30)) == "under a minute left")
    #expect(s.leftLabel(at: t0.addingTimeInterval(26 * 60)) == "time’s up")
    #expect(s.fractionDone(at: t0.addingTimeInterval(12.5 * 60)) == 0.5)
}

// MARK: - Saved files

@Test func oldAndOddFilesStillLoad() throws {
    let json = #"""
    {"state":"yellow","level":1.7,"dayStamp":"2026-10-29",
     "checkins":[{"id":"6F9619FF-8B86-D011-B42D-00C04FC964FF","state":"yellow","at":"2026-10-29T09:00:00.000Z"},
                 {"state":"purple","at":"nope"}],
     "tasks":[{"id":"t1","title":"Meds","done":true},{"title":"broken"}],
     "anchors":[{"id":"b","title":"Later","hour":15,"minute":0,"category":"evening","status":"done"},
                {"id":"a","title":"Sooner","hour":9,"minute":0},
                {"id":"c","title":"  ","hour":10,"minute":0}],
     "dump":["an old string line"]}
    """#
    let d = try JSONDecoder.neuropal.decode(DayData.self, from: Data(json.utf8))
    #expect(d.state == .yellow)
    #expect(d.level == 1)
    #expect(d.checkins.count == 1)
    #expect(d.tasks.map(\.id) == ["t1"])
    #expect(d.anchors.map(\.id) == ["a", "b"])
    #expect(d.anchors[0].flexMinutes == DayAnchor.defaultFlex)
    #expect(d.dump.map(\.text) == ["an old string line"])
    #expect(d.sit == nil)
    #expect(d.sitNotes.isEmpty)
}

@Test func aDayRoundTrips() throws {
    var d = DayData.starter
    d.recordCheckIn(.yellow, level: 0.42, at: at(9, 0), now: at(9, 0))
    d.addDump("thought", now: at(9, 1))
    d.startSit(minutes: 25, label: "Paper", now: at(9, 2))
    let back = try JSONDecoder.neuropal.decode(DayData.self, from: JSONEncoder.neuropal.encode(d))
    #expect(back == d)
}

@Test func aWidgetCheckInGoesIntoTheFile() {
    let url = tempURL()
    let now = Date()
    DayFile.recordCheckIn(.green, at: now.addingTimeInterval(-90), url: url)
    let day = DayFile.recordCheckIn(.yellow, at: now.addingTimeInterval(-60), url: url)
    #expect(day.state == .yellow)
    #expect(day.checkins.count == 1, "within a minute: refined, like on Home")
    #expect(DayFile.load(from: url)?.state == .yellow)
    #expect(DayFile.load(from: url)?.tasks == DayData.starter.tasks, "a first widget check-in starts a starter day")
}

// MARK: - The store

@MainActor
@Test func checkInUpdatesState() {
    let store = DayStore(day: .starter, persist: false)
    store.checkIn(.yellow, level: 0.55)
    #expect(store.day.state == .yellow)
    #expect(store.day.checkins.last?.level == 0.55)
    #expect(!store.isPersistent)
}

@MainActor
@Test func theStoreNeverOverwritesAWidgetsCheckIn() {
    let url = tempURL()
    let store = DayStore(day: .starter, fileURL: url, chatURL: nil)
    store.checkIn(.green, level: 0.1, at: Date().addingTimeInterval(-600))
    #expect(DayFile.load(from: url)?.checkins.count == 1)
    // the widget writes while the app is in the background…
    DayFile.recordCheckIn(.yellow, at: Date().addingTimeInterval(-300), url: url)
    // …and the app saves something else before it comes back
    store.addTask("Water the plant")
    #expect(store.day.checkins.map(\.state) == [.green, .yellow])
    #expect(store.day.state == .yellow)
    let disk = DayFile.load(from: url)
    #expect(disk?.checkins.count == 2)
    #expect(disk?.tasks.last?.title == "Water the plant")
}

@MainActor
@Test func theStoreReloadsWhenTheAppReturns() {
    let url = tempURL()
    let store = DayStore(day: .starter, fileURL: url, chatURL: nil)
    store.addTask("Something")
    DayFile.recordCheckIn(.red, at: Date().addingTimeInterval(-30), url: url)
    #expect(store.day.state == nil)
    store.reloadFromDisk()
    #expect(store.day.state == .red)
    #expect(store.day.tasks.contains { $0.title == "Something" })
}

@MainActor
@Test func reloadMergesCheckInsByIDAndMendsTheFile() {
    let url = tempURL()
    let store = DayStore(day: .starter, fileURL: url, chatURL: nil)
    store.checkIn(.green, level: 0.1, at: Date().addingTimeInterval(-900))
    // Another writer left a copy that lost the app's check-in but has one of
    // its own (a lost update): replacing wholesale would drop the green one.
    var other = DayData.starter
    other.recordCheckIn(.yellow, at: Date().addingTimeInterval(-300))
    DayFile.save(other, to: url)
    store.reloadFromDisk()
    #expect(store.day.checkins.map(\.state) == [.green, .yellow], "both kept, joined by id")
    #expect(store.day.state == .yellow, "the newer one is the state")
    #expect(DayFile.load(from: url)?.checkins.map(\.state) == [.green, .yellow], "and the file holds both again")
}

@MainActor
@Test func aCheckInTheAppRefinedNeverComesBack() {
    let url = tempURL()
    let store = DayStore(day: .starter, fileURL: url, chatURL: nil)
    let t = Date().addingTimeInterval(-600)
    store.checkIn(.green, level: 0.1, at: t)
    let old = DayFile.load(from: url)!
    store.checkIn(.yellow, level: 0.4, at: t.addingTimeInterval(30)) // within a minute: refines the green one
    #expect(store.day.checkins.map(\.state) == [.yellow])
    DayFile.save(old, to: url) // an old copy of the file turns up
    store.reloadFromDisk()
    #expect(store.day.checkins.map(\.state) == [.yellow])
    store.addTask("Water the plant")
    #expect(store.day.checkins.map(\.state) == [.yellow], "nor on the next save")
    #expect(DayFile.load(from: url)?.checkins.map(\.state) == [.yellow])
}

@Test func coordinatedWritesLoseNothing() {
    // Many writers at once (as the app and a widget can be): every check-in
    // lands, because each read-modify-write runs under the file coordinator.
    let url = tempURL()
    let start = Date(timeIntervalSince1970: (Date().timeIntervalSince1970 - 24 * 3600).rounded(.down)) // the file keeps ms
    let n = 24
    DispatchQueue.concurrentPerform(iterations: n) { i in
        DayFile.recordCheckIn(i.isMultiple(of: 2) ? .green : .yellow, at: start.addingTimeInterval(TimeInterval(i * 120)),
                              url: url)
    }
    let day = DayFile.load(from: url)
    #expect(day?.checkins.count == n)
    #expect(day?.checkins.map(\.at) == (0..<n).map { start.addingTimeInterval(TimeInterval($0 * 120)) }, "in time order")
}

// MARK: - The end-of-sit notification

/// Records what the store asks of the notifications.
@MainActor
private final class FakeReminders: SitReminderScheduling {
    var answer: SitReminderState = .scheduled
    var scheduled: [(id: String, title: String, body: String)] = []
    var refreshed: [String] = []
    var cancels = 0
    /// Hold `schedule` (the permission question still open) until released.
    var hold = false
    private var waiting: CheckedContinuation<Void, Never>?

    func schedule(_ sit: SitSession, title: String, body: String,
                  stillWanted: @escaping @MainActor () -> Bool) async -> SitReminderState {
        scheduled.append((sit.id, title, body))
        if hold { await withCheckedContinuation { waiting = $0 } }
        return stillWanted() ? answer : .unknown
    }

    func refresh(_ sit: SitSession, title: String, body: String) async -> SitReminderState {
        refreshed.append(sit.id)
        return answer
    }

    func cancel() { cancels += 1 }

    var isWaiting: Bool { waiting != nil }
    func release() {
        waiting?.resume()
        waiting = nil
    }
}

@MainActor
@Test func aSitSetsItsEndNoticeAndTakesItBack() async {
    let fake = FakeReminders()
    let store = DayStore(day: .starter, fileURL: nil, chatURL: nil, reminders: fake)
    var pal = Appearance.Pal()
    pal.name = "Quark"
    store.pal = pal
    let s = store.startSit(minutes: 25, label: "Thesis intro")
    await store.reminderTask?.value
    #expect(fake.scheduled.map(\.id) == [s.id])
    #expect(fake.scheduled.first?.title == "Quark: nice.")
    #expect(fake.scheduled.first?.body.contains("Thesis") == false, "no task words on a locked screen")
    #expect(store.sitReminder == .scheduled)
    // Stopping early takes it back; so does putting the finished block away.
    store.endSit()
    #expect(fake.cancels == 2, "one for the block it replaced (none), one for the stop")
    #expect(store.sitReminder == .unknown)
    store.clearSit()
    #expect(fake.cancels == 3)
    store.startSit(minutes: 10)
    await store.reminderTask?.value
    store.endSit()
    store.saveSitNote("Wrote the outline")
    #expect(fake.cancels == 6)
}

@MainActor
@Test func withNotificationsOffTheSitSaysSo() async {
    let fake = FakeReminders()
    fake.answer = .off
    let store = DayStore(day: .starter, fileURL: nil, chatURL: nil, reminders: fake)
    store.startSit(minutes: 10)
    await store.reminderTask?.value
    #expect(store.sitReminder == .off)
    // The sit screen checks again (never asking): still off.
    store.refreshSitReminder()
    await store.reminderTask?.value
    #expect(fake.refreshed.count == 1)
    #expect(store.sitReminder == .off)
}

@MainActor
@Test func aSitStoppedWhilePalWasAskingGetsNoNotice() async {
    let fake = FakeReminders()
    fake.hold = true
    let store = DayStore(day: .starter, fileURL: nil, chatURL: nil, reminders: fake)
    store.startSit(minutes: 25)
    while !fake.isWaiting { await Task.yield() }
    store.refreshSitReminder()
    #expect(fake.refreshed.isEmpty, "no second request while the first is still asking")
    store.endSit()
    fake.release()
    await store.reminderTask?.value
    #expect(store.sitReminder == .unknown)
    #expect(fake.cancels == 2)
}

@MainActor
@Test func thePersistentStoreStartsFromTheFile() {
    let url = tempURL()
    var saved = DayData.starter
    saved.recordCheckIn(.green, at: Date().addingTimeInterval(-60))
    DayFile.save(saved, to: url)
    let store = DayStore(day: nil, fileURL: url, chatURL: nil)
    #expect(store.day.state == .green)
    #expect(store.isPersistent)
}

@MainActor
@Test func theChatKeepsTheLastThirtyLines() {
    let chatURL = tempURL("pal-chat.json")
    let store = DayStore(day: .starter, fileURL: nil, chatURL: chatURL)
    for i in 0..<35 { store.appendChat(PalChatLine(role: i.isMultiple(of: 2) ? .user : .pal, text: "line \(i)")) }
    #expect(store.chat.count == DayStore.chatKeep)
    #expect(store.chat.first?.text == "line 5")
    let again = DayStore(day: .starter, fileURL: nil, chatURL: chatURL)
    #expect(again.chat.count == DayStore.chatKeep)
    again.clearChat()
    #expect(DayStore(day: .starter, fileURL: nil, chatURL: chatURL).chat.isEmpty)
}

@MainActor
@Test func theStoreRunsTheMinimumDayAnchorsAndDump() {
    let store = DayStore(day: .starter, persist: false)
    #expect(store.addTask("Four"))
    #expect(store.addTask("Five"))
    #expect(!store.addTask("Six"))
    store.saveAnchor(DayAnchor(id: "z", title: "Call mum", hour: 18, minute: 0, category: "social"))
    store.setAnchor("z", status: .skipped)
    #expect(store.day.anchors.first { $0.id == "z" }?.status == .skipped)
    let item = store.addDump("idea")
    #expect(store.removeDump(item!.id) == item)
    let sit = store.startSit(minutes: 10, label: "Email")
    #expect(store.day.sit?.id == sit.id)
    store.endSit()
    #expect(store.day.sit?.endReason == .done)
    store.clearSit()
    #expect(store.day.sit == nil)
}
