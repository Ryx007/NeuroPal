import Foundation
import Observation

/// The app's top-level places. iPhone shows them as tabs, iPad as a sidebar.
public enum NPTab: String, CaseIterable, Hashable, Sendable {
    case home, library, pal, settings

    public var title: String {
        switch self {
        case .home: return "Home"
        case .library: return "Library"
        case .pal: return "Pal"
        case .settings: return "Settings"
        }
    }

    /// SF Symbol name.
    public var symbol: String {
        switch self {
        case .home: return "sun.max"
        case .library: return "books.vertical"
        case .pal: return "face.smiling"
        case .settings: return "gearshape"
        }
    }
}

/// Pal's assistant tools (the sheet's tabs).
public enum PalTool: String, CaseIterable, Hashable, Sendable, Codable {
    case whatNow, breakdown, dump, sit, talk

    public var title: String {
        switch self {
        case .whatNow: return "What now?"
        case .breakdown: return "Break it down"
        case .dump: return "Brain dump"
        case .sit: return "Sit with me"
        case .talk: return "Talk"
        }
    }
}

/// Somewhere the app can be sent: a tab, a document, the calming steps, Pal.
public enum NPRoute: Hashable, Sendable {
    case tab(NPTab)
    /// Open a document in the reader.
    case reader(documentID: String)
    /// Open a document with Ask (chat with the document) showing.
    case ask(documentID: String)
    /// The calming steps (TIPP), full screen, above everything.
    case calm
    /// Pal's assistant sheet, optionally on one tool.
    case pal(PalTool?)
}

/// Cross-feature navigation: Home → the reader, Pal → the calming steps, a
/// widget link → anywhere. Features call `open(_:)`; the app shell (and only
/// the shell) turns these properties into navigation.
@MainActor
@Observable
public final class AppNavigator {
    public var tab: NPTab = .home
    /// The document open in the reader (iPhone pushes it from Library; iPad
    /// shows it in the detail column).
    public var openDocumentID: String?
    /// Ask is showing alongside the reader.
    public var askOpen = false
    /// The calming steps are up (full screen over everything). Opening them
    /// posts `AppNavigator.calmingStepsOpened` (read-aloud pauses for it).
    public var calmOpen = false {
        didSet {
            if calmOpen && !oldValue { NotificationCenter.default.post(name: Self.calmingStepsOpened, object: self) }
        }
    }

    /// Posted on the main thread when the calming steps open.
    public nonisolated static let calmingStepsOpened = Notification.Name("io.neuropal.calmingStepsOpened")
    /// Pal's sheet is up, on this tool.
    public var palOpen = false
    public var palTool: PalTool?

    public init() {}

    public func open(_ route: NPRoute) {
        switch route {
        case .tab(let t):
            tab = t
        case .reader(let id):
            tab = .library
            openDocumentID = id
            askOpen = false
        case .ask(let id):
            tab = .library
            openDocumentID = id
            askOpen = true
        case .calm:
            palOpen = false
            calmOpen = true
        case .pal(let tool):
            palTool = tool
            palOpen = true
        }
    }
}

/// neuropal:// links (widgets, Spotlight, notifications).
///   neuropal://calm                 the calming steps
///   neuropal://pal[?tool=talk]      Pal's sheet
///   neuropal://read?doc=<id>        a document
///   neuropal://home | library | settings
/// A link only ever navigates — check-ins from widgets go through App
/// Intents, so another app opening a link can't record anything.
public enum DeepLink {
    public static func route(for url: URL) -> NPRoute? {
        guard url.scheme?.lowercased() == "neuropal" else { return nil }
        let place = (url.host ?? "").lowercased()
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value }
        switch place {
        case "calm": return .calm
        case "pal": return .pal(value("tool").flatMap(PalTool.init(rawValue:)))
        case "read":
            guard let id = value("doc"), id.range(of: "^[0-9a-fA-F]{24}$", options: .regularExpression) != nil else { return nil }
            return .reader(documentID: id)
        case "home": return .tab(.home)
        case "library": return .tab(.library)
        case "settings": return .tab(.settings)
        default: return nil
        }
    }

    public static func url(for route: NPRoute) -> URL {
        switch route {
        case .calm: return URL(string: "neuropal://calm")!
        case .pal(let tool): return URL(string: "neuropal://pal" + (tool.map { "?tool=\($0.rawValue)" } ?? ""))!
        case .reader(let id), .ask(let id): return URL(string: "neuropal://read?doc=\(id)")!
        case .tab(let t): return URL(string: "neuropal://\(t.rawValue)")!
        }
    }
}
