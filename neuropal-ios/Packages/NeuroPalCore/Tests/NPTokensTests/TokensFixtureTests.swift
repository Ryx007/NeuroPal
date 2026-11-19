import Foundation
import Testing
@testable import NPTokens

/// The cross-language contract: packages/tokens/fixtures/cases.json, copied
/// here by packages/tokens/scripts/sync.js. Every case the JS computes, the
/// Swift port must reproduce exactly.
struct Fixtures: Decodable, Sendable {
    struct PaletteCase: Decodable, Sendable {
        let input: JSONValue
        let output: Palette
    }

    struct InterpretAppearanceCase: Decodable, Sendable {
        let skin: String
        let text: String
        let rows: [Tokens.ChangeRow]?
        let error: String?
        let next: JSONValue?
    }

    struct InterpretHomeCase: Decodable, Sendable {
        let text: String
        let rows: [Tokens.ChangeRow]?
        let error: String?
        let next: JSONValue?
        let title: String?
    }

    struct EffectiveTilesCase: Decodable, Sendable {
        let home: JSONValue
        let date: String
        let ids: [String]
    }

    struct PalCase: Decodable, Sendable {
        let body: String
        let acc: String
        let faceInk: String
        let visor: String
    }

    let tokensVersion: Int
    let classic: [PaletteCase]
    let signal: [PaletteCase]
    let interpretAppearance: [InterpretAppearanceCase]
    let interpretHome: [InterpretHomeCase]
    let effectiveTiles: [EffectiveTilesCase]
    let pal: [PalCase]

    static let shared: Fixtures = {
        let url = Bundle.module.url(forResource: "cases", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONDecoder().decode(Fixtures.self, from: Data(contentsOf: url))
    }()
}

/// The JSON a JS client would hold for this value: what Swift encodes, plus
/// `updatedAt: null` (Swift leaves a nil key out; JS writes null).
func wire<T: Encodable>(_ value: T) -> JSONValue {
    var json = try! JSONValue(encoding: value)
    if case .object(var o) = json, T.self == Appearance.self, o["updatedAt"] == nil {
        o["updatedAt"] = .null
        json = .object(o)
    }
    return json
}

/// "2026-10-22T09:00:00" in LOCAL time, like JS `new Date(...)` without a zone.
func localDate(_ s: String) -> Date {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.calendar = Calendar(identifier: .gregorian)
    f.timeZone = .current
    f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    return f.date(from: s)!
}

@Test func fixturesLoad() {
    let f = Fixtures.shared
    #expect(f.tokensVersion == Tokens.version)
    #expect(f.classic.count == 16)
    #expect(f.signal.count == 42)
    #expect(f.interpretAppearance.count == 25)
    #expect(f.interpretHome.count == 15)
    #expect(f.effectiveTiles.count == 3)
    #expect(f.pal.count == 18)
}

@Test func tokenDataLoads() {
    #expect(Tokens.data["classicThemeNames"]?.arrayValue?.count == 4)
    let t = Tokens.tables
    #expect(t.tokensVersion == Tokens.version)
    #expect(t.signalPresets.map(\.name) == ["Signal", "Ember", "Concrete", "Night lab", "UV"])
    #expect(t.signalLooks.map(\.name) == ["Everyday", "Evening", "Lab", "Overwhelmed"])
    #expect(t.homeTiles.map(\.id) == ["state", "anchor", "focus", "mvd", "reading", "pal"])
    #expect(t.palColours.map(\.name) == ["Chalk", "Bone", "Graphite", "Red", "Mint", "Lilac"])
    #expect(t.signalBases.map(\.name) == ["Graphite", "Concrete", "Black", "Warm"])
}

@Test func defaultPalettesMatchTheFixtures() {
    let f = Fixtures.shared
    // classic[0] is dark + ruby, signal[0] the Signal default preset.
    #expect(f.classic[0].output == Palette.classicDefault)
    #expect(f.signal[0].output == Palette.signalDefault)
    #expect(Tokens.palette(for: .default) == Palette.classicDefault)
    #expect(Tokens.palette(for: Appearance(skin: .signal)) == Palette.signalDefault)
}

@Test("classic (resolveClassicPalette)", arguments: Fixtures.shared.classic.indices)
func classicPalette(_ i: Int) {
    let c = Fixtures.shared.classic[i]
    #expect(Tokens.resolveClassicPalette(json: c.input) == c.output)
    let theme = c.input["theme"]?.stringValue ?? ""
    let accent = c.input["accent"]?.stringValue ?? ""
    #expect(Tokens.resolveClassicPalette(theme: theme, accent: accent) == c.output)
}

@Test("signal (resolveSignalPalette)", arguments: Fixtures.shared.signal.indices)
func signalPalette(_ i: Int) {
    let c = Fixtures.shared.signal[i]
    #expect(Tokens.resolveSignalPalette(json: c.input) == c.output)
    #expect(Tokens.resolveSignalPalette(Tokens.normalizeSignal(c.input)) == c.output)
}

@Test func hslToHexRebuildsTheFixtureAccents() {
    // sync.js builds most Signal inputs with hslToHex(h, 1, l).
    let cases = Fixtures.shared.signal
    let presets = Tokens.tables.signalPresets.count
    var i = 0
    for h in stride(from: 0, to: 360, by: 30) {
        for l in [0.4, 0.56, 0.72] {
            #expect(Tokens.hslToHex(Double(h), 1, l) == cases[presets + i].input["acc"]?.stringValue, "h=\(h) l=\(l)")
            i += 1
        }
    }
}

@Test("interpretAppearance", arguments: Fixtures.shared.interpretAppearance.indices)
func interpretAppearance(_ i: Int) {
    let c = Fixtures.shared.interpretAppearance[i]
    let start = Tokens.normalizeAppearance(["skin": .string(c.skin)])
    switch Tokens.interpretAppearance(c.text, start) {
    case .success(let p):
        #expect(c.error == nil, "\(c.text): JS refused with \(c.error ?? "")")
        #expect(p.rows == c.rows, "\(c.text)")
        #expect(wire(p.next) == c.next, "\(c.text)")
    case .failure(let refusal):
        #expect(refusal.message == c.error, "\(c.text)")
        #expect(c.rows == nil && c.next == nil, "\(c.text)")
    }
}

@Test("interpretHome", arguments: Fixtures.shared.interpretHome.indices)
func interpretHome(_ i: Int) {
    let c = Fixtures.shared.interpretHome[i]
    switch Tokens.interpretHome(c.text, Tokens.normalizeHome(nil)) {
    case .success(let p):
        #expect(c.error == nil, "\(c.text): JS refused with \(c.error ?? "")")
        #expect(p.rows == c.rows, "\(c.text)")
        #expect(p.title == c.title, "\(c.text)")
        #expect(wire(p.next) == c.next, "\(c.text)")
    case .failure(let refusal):
        #expect(refusal.message == c.error, "\(c.text)")
        #expect(c.rows == nil && c.next == nil && c.title == nil, "\(c.text)")
    }
}

@Test("effectiveTiles", arguments: Fixtures.shared.effectiveTiles.indices)
func effectiveTiles(_ i: Int) {
    let c = Fixtures.shared.effectiveTiles[i]
    let home = Tokens.normalizeHome(c.home)
    #expect(Tokens.effectiveTiles(home, date: localDate(c.date)).map(\.id) == c.ids)
}

@Test("pal (palFaceInk, palVisor)", arguments: Fixtures.shared.pal.indices)
func palColours(_ i: Int) {
    let c = Fixtures.shared.pal[i]
    #expect(Tokens.palFaceInk(c.body) == c.faceInk)
    #expect(Tokens.palVisor(c.body, c.acc) == c.visor)
}

// MARK: - Behaviour the app relies on

@Test func normalizeAppearanceRepairsAnything() {
    #expect(Tokens.normalizeAppearance(nil) == .default)
    #expect(Tokens.normalizeAppearance(.string("garbage")) == .default)
    #expect(Tokens.normalizeAppearance(.array([1, 2])) == .default)
    // Typed decoding goes through the same normaliser and never throws.
    let json = Data(##"{"skin":"signal","signal":{"acc":"#00ff88","brutality":"3","base":"Lava"},"pal":{"name":"  Ziggy  "},"extra":1}"##.utf8)
    let a = try? JSONDecoder().decode(Appearance.self, from: json)
    #expect(a?.skin == .signal)
    #expect(a?.signal.acc == "#00FF88")
    #expect(a?.signal.brutality == 3)
    #expect(a?.signal.base == "Graphite")
    #expect(a?.pal.name == "Ziggy")
    #expect(a?.home == Appearance.Home())
}

@Test func palSayFillsPlaceholders() {
    let pal = Appearance.Pal(talk: "Direct")
    #expect(Tokens.palSay(pal, "focus", ["task": "the CPI notes"]) == "25 minutes on the CPI notes. Go?")
    #expect(Tokens.palSay(pal, "focus") == "25 minutes on {task}. Go?")
    #expect(Tokens.palSay(pal, "about") == "short, concrete and to the point")
    #expect(Tokens.palSay(pal, "nope") == "")
}

@Test func jsNumberFormatting() {
    #expect(JS.numberToString(1) == "1")
    #expect(JS.numberToString(0.3) == "0.3")
    #expect(JS.numberToString(1e-7) == "1e-7")
    #expect(JS.numberToString(0.000001) == "0.000001")
    #expect(JS.numberToString(1e21) == "1e+21")
    #expect(JS.numberToString(1.5e20) == "150000000000000000000")
    #expect(JS.numberToString(-2.5) == "-2.5")
    #expect(JS.round(-2.5) == -2)
    #expect(JS.round(2.5) == 3)
    #expect(JS.number(.null) == 0)
    #expect(JS.number(nil).isNaN)
    #expect(JS.number(.array([])) == 0)
    #expect(JS.number(.string(" 0x1F ")) == 31)
}
