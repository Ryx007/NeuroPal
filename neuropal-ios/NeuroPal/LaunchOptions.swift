import Foundation
import NPCore

/// Launch arguments for screenshots and UI checks (never used by a normal
/// launch):
///   -NPMock 1                 offline fixtures (MockNeuroPalAPI), signed in
///   -NPSignedOut 1            with -NPMock: start signed out (sign-in screen)
///   -NPSignUp 1               with -NPSignedOut: the sign-in screen on "Create account"
///   -NPServerForm 1           with -NPSignedOut: the server address open on sign-in
///   -NPOffline 1              with -NPMock: the server can't be reached (the app
///                             opens offline with the cached user; banner shows)
///   -NPScreen <name>          start on: home | library | reader | ask | pal | calm | settings
///                             | widgets (every widget at its real sizes)
///   -NPDoc <id>               the document for reader/ask (default: the sample paper)
///   -NPSkin classic|signal    the skin (with -NPMock)
///   -NPClassicTheme <name>    dark | sepia | light | contrast
///   -NPPalTool <tool>         whatNow | breakdown | dump | sit | talk (with -NPScreen pal)
///   -NPHost <url>             a real server at this address, nothing saved (e.g. a backend
///                             running on the Mac: http://localhost:4100)
///   -NPToken <jwt>            (debug builds, with -NPHost) open signed in with this session
///
/// Read by the features themselves (all mock-only, for screenshots):
///   Home    -NPCheckIn green|yellow|red     today's check-in
///           -NPHomeSheet anchors|newAnchor|editAnchor|minimumDay   open that sheet
///           -NPCalmStep <n>                 the calming steps on step n
///   Pal     -NPSitMinutes <n>               "Sit with me" running for n minutes
///           -NPPalChat 1|crisis             a chat already under way (or a crisis reply)
///           -NPPalDump 1                    a brain dump with entries
///           -NPPalTask "<text>"             Break it down, already filled in
///   Settings -NPSettingsPane <pane>         open that pane (look | reading | pal | accessibility | account | about)
///           -NPSettingsAsk "<text>"         Make it yours with an Ask Pal proposal showing
///   Reader  -NPReadAloud 1                  start reading aloud on open
struct LaunchOptions {
    var mock = false
    var signedOut = false
    var signUp = false
    var serverForm = false
    var offline = false
    var widgetGallery = false
    /// A real server to use for this launch only (no saved session or look).
    var host: URL?
    /// Debug builds: a session for `host`, for end-to-end screenshots.
    var token: String?
    var route: NPRoute?
    var appearance: Appearance?

    static var current: LaunchOptions { LaunchOptions(defaults: .standard) }

    init(defaults: UserDefaults) {
        mock = defaults.bool(forKey: "NPMock")
        host = defaults.string(forKey: "NPHost").flatMap(URL.init(string:))
        #if DEBUG
        token = defaults.string(forKey: "NPToken")
        #endif
        signedOut = defaults.bool(forKey: "NPSignedOut")
        signUp = defaults.bool(forKey: "NPSignUp")
        serverForm = defaults.bool(forKey: "NPServerForm")
        offline = defaults.bool(forKey: "NPOffline")
        let doc = defaults.string(forKey: "NPDoc") ?? MockFixtures.paperID
        switch defaults.string(forKey: "NPScreen") {
        case "home": route = .tab(.home)
        case "library": route = .tab(.library)
        case "reader": route = .reader(documentID: doc)
        case "ask": route = .ask(documentID: doc)
        case "pal": route = .pal(defaults.string(forKey: "NPPalTool").flatMap(PalTool.init(rawValue:)))
        case "calm": route = .calm
        case "settings": route = .tab(.settings)
        case "widgets": widgetGallery = true
        default: route = nil
        }
        if mock {
            var a = Appearance()
            if defaults.string(forKey: "NPSkin") == "signal" { a.skin = .signal }
            if let t = defaults.string(forKey: "NPClassicTheme") { a.classic.theme = t }
            appearance = a
        }
    }
}
