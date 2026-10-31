import Foundation
import NPCore

/// day.json on disk, for code that runs outside the app's DayStore — the
/// widget extension's check-in intent and its timelines. Same rules as the
/// app (DayRules.swift); the app picks the change up when it comes back to
/// the foreground (DayStore.reloadFromDisk).
///
/// The app and the widget extension are two processes writing one file: every
/// read-modify-write goes through `update`, which holds a file coordinator
/// (NSFileCoordinator) around it, so neither can write over the other's change.
public enum DayFile {
    /// day.json in the shared App Group container.
    public static var url: URL { SharedContainer.url(DayStore.fileName) }

    public static func load(from url: URL = DayFile.url) -> DayData? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder.neuropal.decode(DayData.self, from: data)
    }

    /// Atomic write: a reader never sees half a file. On its own it replaces
    /// the file — to change the day, use `update`.
    public static func save(_ day: DayData, to url: URL = DayFile.url) {
        guard let data = try? JSONEncoder.neuropal.encode(day) else { return }
        #if os(iOS)
        // Readable by the widget after the first unlock, even while locked.
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try? data.write(to: url, options: [.atomic])
        #endif
    }

    /// Read, change, write — coordinated with every other process doing the
    /// same (the widget's intent, the app), so no update is lost between the
    /// read and the write. `change` gets the file's day (nil when there is
    /// none yet) and returns the day to write; that day is returned.
    @discardableResult
    public static func update(at url: URL = DayFile.url, _ change: (DayData?) -> DayData) -> DayData {
        var written: DayData?
        var failure: NSError?
        NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: .forMerging, error: &failure) { u in
            let next = change(load(from: u))
            save(next, to: u)
            written = next
        }
        if let written { return written }
        // The coordinator couldn't run (it shouldn't happen): the change
        // still lands, uncoordinated, rather than being dropped.
        let next = change(load(from: url))
        save(next, to: url)
        return next
    }

    /// A check-in from a widget button: read, apply the app's rule, write.
    /// The day rolls over first if the file is from yesterday.
    @discardableResult
    public static func recordCheckIn(_ state: NervousState, at: Date = Date(), url: URL = DayFile.url) -> DayData {
        update(at: url) { disk in
            var day = disk ?? .starter
            day.rollOver(now: at)
            day.recordCheckIn(state, level: nil, at: at, now: at)
            return day
        }
    }
}
