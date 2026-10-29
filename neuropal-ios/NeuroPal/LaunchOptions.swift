import Foundation
import NPCore

/// Launch arguments for screenshots and UI checks (never used by a normal
/// launch):
///   -NPMock 1                 offline fixtures (MockNeuroPalAPI), signed in
///   -NPSignedOut 1            with -NPMock: start signed out (sign-in screen)
///   -NPScreen <name>          start on: home | library | reader | ask | pal | calm | settings
///                             | widgets (every widget at its real sizes)
///   -NPDoc <id>               the document for reader/ask (default: the sample paper)
///   -NPSkin classic|signal    the skin (with -NPMock)
///   -NPClassicTheme <name>    dark | sepia | light | contrast
///   -NPPalTool <tool>         whatNow | breakdown | dump | sit | talk (with -NPScreen pal)
///   -NPHost <url>             a real server at this address, nothing saved (e.g. a backend
///                             running on the Mac: http://localhost:4100)
struct LaunchOptions {
    var mock = false
    var signedOut = false
    var widgetGallery = false
    /// A real server to use for this launch only (no saved session or look).
    var host: URL?
    var route: NPRoute?
    var appearance: Appearance?

    static var current: LaunchOptions { LaunchOptions(defaults: .standard) }

    init(defaults: UserDefaults) {
        mock = defaults.bool(forKey: "NPMock")
        host = defaults.string(forKey: "NPHost").flatMap(URL.init(string:))
        signedOut = defaults.bool(forKey: "NPSignedOut")
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
