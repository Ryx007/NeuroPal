import Foundation
import NPCore

/// Launch arguments for screenshots and UI checks. They exist only in
/// DEBUG builds and are read from this launch's process arguments (never
/// from saved settings): a Release build always starts normally.
///   -NPMock 1                 offline fixtures (MockNeuroPalAPI), signed in
///   -NPSignedOut 1            with -NPMock: start signed out (sign-in screen)
///   -NPSignUp 1               with -NPSignedOut: the sign-in screen on "Create account"
///   -NPServerForm 1|<address> with -NPSignedOut: the server address open on sign-in
///                             (an address is typed into it, e.g. http://192.168.1.20:4000)
///   -NPOffline 1              with -NPMock: the server can't be reached (the app
///                             opens offline with the cached user; banner shows)
///   -NPScreen <name>          start on: home | library | reader | ask | pal | calm | settings
///                             | widgets (every widget at its real sizes)
///   -NPDoc <id>               the document for reader/ask (default: the sample paper)
///   -NPSkin classic|signal    the skin (with -NPMock)
///   -NPClassicTheme <name>    dark | sepia | light | contrast
///   -NPPalTool <tool>         whatNow | breakdown | dump | sit | talk (with -NPScreen pal)
///   -NPHost <url>             a real server at this address, nothing saved (e.g. a backend
///                             running on the Mac: http://localhost:4100); checked like
///                             an address typed into the app
///   -NPToken <jwt>            with -NPHost: open signed in with this session
///
/// Read by the features themselves (mock mode only, for screenshots):
///   Home    -NPCheckIn green|yellow|red     today's check-in
///           -NPHomeSheet anchors|newAnchor|editAnchor|minimumDay   open that sheet
///           -NPCalmStep <n>                 the calming steps on step n
///   Pal     -NPSitMinutes <n>               "Sit with me" running for n minutes
///           -NPSitReminder off|scheduled    with -NPSitMinutes: the reminder at its end
///           -NPPalSay "<text>"              Talk sends this text at launch through the real path
///           -NPPalChat 1|crisis             a chat already under way (or a crisis reply)
///           -NPPalDump 1                    a brain dump with entries
///           -NPPalTask "<text>"             Break it down, already filled in
///   Settings -NPSettingsPane <pane>         open that pane (look | reading | pal | accessibility | account | about)
///           -NPSettingsAsk "<text>"         Make it yours with an Ask Pal proposal showing
///   Reader  -NPReadAloud 1                  start reading aloud on open
///           -NPReaderSheet chapters|options, -NPReaderMode pages, -NPLibrarySearch "<text>"
struct LaunchOptions {
    var mock = false
    var signedOut = false
    var signUp = false
    var serverForm = false
    /// An address typed into the server form (with `serverForm`).
    var serverText: String?
    var offline = false
    var widgetGallery = false
    /// A real server to use for this launch only (no saved session or look).
    var host: URL?
    /// A session for `host`, for end-to-end screenshots.
    var token: String?
    var route: NPRoute?
    var appearance: Appearance?

    /// This launch's options: none at all in a Release build.
    static var current: LaunchOptions {
        var options = LaunchOptions()
        #if DEBUG
        options.readArguments()
        #endif
        return options
    }

    #if DEBUG
    private mutating func readArguments() {
        mock = DebugLaunch.mock
        host = DebugLaunch.string("NPHost").flatMap { try? ServerAddress.parse($0) }
        token = host == nil ? nil : DebugLaunch.string("NPToken")
        signedOut = DebugLaunch.bool("NPSignedOut")
        signUp = DebugLaunch.bool("NPSignUp")
        if let form = DebugLaunch.string("NPServerForm") {
            serverForm = DebugLaunch.bool("NPServerForm") || form.contains(".") || form.contains(":")
            if form.contains(".") || form.contains(":") { serverText = form }
        }
        offline = DebugLaunch.bool("NPOffline")
        let doc = DebugLaunch.string("NPDoc") ?? MockFixtures.paperID
        switch DebugLaunch.string("NPScreen") {
        case "home": route = .tab(.home)
        case "library": route = .tab(.library)
        case "reader": route = .reader(documentID: doc)
        case "ask": route = .ask(documentID: doc)
        case "pal": route = .pal(DebugLaunch.string("NPPalTool").flatMap(PalTool.init(rawValue:)))
        case "calm": route = .calm
        case "settings": route = .tab(.settings)
        case "widgets": widgetGallery = true
        default: route = nil
        }
        if mock {
            var a = Appearance()
            if DebugLaunch.string("NPSkin") == "signal" { a.skin = .signal }
            if let t = DebugLaunch.string("NPClassicTheme") { a.classic.theme = t }
            appearance = a
        }
    }
    #endif
}
