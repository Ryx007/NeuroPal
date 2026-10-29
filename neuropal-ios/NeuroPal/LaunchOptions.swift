import Foundation
import NPCore

/// Launch arguments for screenshots and UI checks (never used by a normal
/// launch):
///   -NPMock 1                 offline fixtures (MockNeuroPalAPI), signed in
///   -NPSignedOut 1            with -NPMock: start signed out (sign-in screen)
///   -NPScreen <name>          start on: home | library | reader | ask | pal | calm | settings
///   -NPDoc <id>               the document for reader/ask (default: the sample paper)
///   -NPSkin classic|signal    the skin (with -NPMock)
///   -NPClassicTheme <name>    dark | sepia | light | contrast
///   -NPPalTool <tool>         whatNow | breakdown | dump | sit | talk (with -NPScreen pal)
struct LaunchOptions {
    var mock = false
    var signedOut = false
    var route: NPRoute?
    var appearance: Appearance?

    static var current: LaunchOptions { LaunchOptions(defaults: .standard) }

    init(defaults: UserDefaults) {
        mock = defaults.bool(forKey: "NPMock")
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
