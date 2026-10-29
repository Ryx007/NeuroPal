import Foundation
import NPCore
import Observation
import SwiftUI

/// Ask → reader: show the passage a citation points at. The reader puts
/// this in the environment of the Ask panel it hosts.
struct CitationJump {
    let perform: @MainActor (Citation) -> Void
}

extension EnvironmentValues {
    /// Set by the reader around its Ask panel; nil when Ask stands alone.
    @Entry var npCitationJump: CitationJump? = nil
}

/// Hand-offs between the reader and Ask that outlive a view: a question
/// started from a text selection, a citation to show when the reader opens.
@MainActor
@Observable
final class ReaderInbox {
    static let shared = ReaderInbox()

    /// documentID → a question to send as soon as Ask shows that document.
    var questions: [String: String] = [:]
    /// documentID → a citation to show when the reader for it next opens.
    var citations: [String: Citation] = [:]

    private init() {}
}

/// Switches for screenshots and UI checks: this launch's arguments, in
/// debug builds, and only in mock mode (`-NPMock 1`) — never on a real
/// server, never from saved settings, never in a Release build.
enum ReaderLaunch {
    /// `-NPReadAloud 1`: start reading aloud (muted) when the reader opens.
    static var readAloud: Bool { DebugLaunch.mock && DebugLaunch.bool("NPReadAloud") }
    /// `-NPReaderSheet chapters|options`: open that sheet over the reader.
    static var sheet: String? { DebugLaunch.mock ? DebugLaunch.string("NPReaderSheet") : nil }
    /// `-NPLibrarySearch <text>`: start the library with this search.
    static var librarySearch: String? { DebugLaunch.mock ? DebugLaunch.string("NPLibrarySearch") : nil }
    /// `-NPReaderMode pages`: open pdf documents on their original pages.
    static var readerMode: String? { DebugLaunch.mock ? DebugLaunch.string("NPReaderMode") : nil }

    static func isMock(_ api: any NeuroPalAPI) -> Bool { api is MockNeuroPalAPI }
}
