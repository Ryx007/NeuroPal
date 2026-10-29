import Foundation
import Testing
@testable import NPTokens

/// Wider cross-language cases (Fixtures/extra-cases.json, computed by the JS
/// through Fixtures/make-extra-cases.mjs): garbage inputs, negations, JS
/// number/string quirks, Home phrases, colour maths.
enum Extra {
    static let json: JSONValue = {
        let url = Bundle.module.url(forResource: "extra-cases", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    }()

    static func cases(_ key: String) -> [JSONValue] { json[key]?.arrayValue ?? [] }

    static let startLooks: [Appearance] = cases("startLooks").map { Tokens.normalizeAppearance($0) }
    static let startHomes: [Appearance.Home] = cases("startHomes").map { Tokens.normalizeHome($0) }
    static let pals: [Appearance.Pal] = cases("pals").map { Tokens.normalizePal($0) }

    static func rgb(_ v: JSONValue?) -> Tokens.RGB? {
        guard let a = v?.arrayValue, a.count == 3 else { return nil }
        return Tokens.RGB(a[0].intValue ?? -1, a[1].intValue ?? -1, a[2].intValue ?? -1)
    }

    /// [skin, theme, accent, acc, base, motion, field, brutality, corners, texture, type]
    static func lookRow(_ a: Appearance) -> JSONValue {
        .array([.string(a.skin.rawValue), .string(a.classic.theme), .string(a.classic.accent), .string(a.signal.acc),
                .string(a.signal.base), .string(a.signal.motion), .string(a.signal.field), .number(Double(a.signal.brutality)),
                .string(a.signal.corners), .string(a.signal.texture), .string(a.signal.type)])
    }

    static func rows(_ v: JSONValue?) -> [Tokens.ChangeRow]? {
        guard let a = v?.arrayValue else { return nil }
        return a.map { Tokens.ChangeRow(k: $0["k"]?.stringValue ?? "", from: $0["from"]?.stringValue ?? "", to: $0["to"]?.stringValue ?? "") }
    }
}

@Test func extraCasesLoad() {
    #expect(Extra.json["tokensVersion"]?.intValue == Tokens.version)
    #expect(Extra.startLooks.count == 7)
    #expect(Extra.cases("interpretAppearance").count > 1000)
}

// The big suites loop instead of using `arguments:` — one line of output
// per suite, not per case (the shared test run stays readable). Every
// failure still names its case.

@Test func extraNormalizeAppearanceOfAnything() {
    let cases = Extra.cases("normalize")
    #expect(cases.count == 135)
    for (i, c) in cases.enumerated() {
        let out = Tokens.normalizeAppearance(c["input"])
        #expect(wire(out) == c["output"], "case \(i): input \(String(describing: c["input"]))")
        if let palette = c["palette"], !palette.isNull {
            #expect(wire(Tokens.palette(for: out)) == palette, "case \(i): input \(String(describing: c["input"]))")
        }
    }
}

@Test func extraInterpretAppearance() {
    let cases = Extra.cases("interpretAppearance")
    #expect(cases.count == 1246)
    for (i, c) in cases.enumerated() {
        let start = Extra.startLooks[c["look"]?.intValue ?? 0]
        let text = c["text"]?.stringValue ?? ""
        let where_ = "case \(i): “\(text)” on look \(c["look"]?.intValue ?? -1)"
        switch Tokens.interpretAppearance(text, start) {
        case .success(let p):
            #expect(c["error"]?.isNull == true, "\(where_)")
            #expect(p.rows == Extra.rows(c["rows"]), "\(where_)")
            #expect(Extra.lookRow(p.next) == c["next"], "\(where_)")
            #expect(p.next.pal == start.pal && p.next.home == start.home && p.next.updatedAt == start.updatedAt, "\(where_)")
        case .failure(let refusal):
            #expect(c["error"]?.stringValue == refusal.message, "\(where_)")
        }
    }
}

@Test func extraInterpretHome() {
    let cases = Extra.cases("interpretHome")
    #expect(cases.count == 388)
    for (i, c) in cases.enumerated() {
        let home = Extra.startHomes[c["home"]?.intValue ?? 0]
        let text = c["text"]?.stringValue ?? ""
        let where_ = "case \(i): “\(text)” on home \(c["home"]?.intValue ?? -1)"
        switch Tokens.interpretHome(text, home) {
        case .success(let p):
            #expect(c["error"]?.isNull == true, "\(where_)")
            #expect(p.rows == Extra.rows(c["rows"]), "\(where_)")
            #expect(wire(p.next) == c["next"], "\(where_)")
            #expect(p.title == c["title"]?.stringValue, "\(where_)")
            #expect(p.message == c["message"]?.stringValue, "\(where_)")
        case .failure(let refusal):
            #expect(c["error"]?.stringValue == refusal.message, "\(where_)")
        }
    }
}

@Test func extraHomeHelpers() {
    for c in Extra.cases("effectiveTiles") {
        let home = Tokens.normalizeHome(c["home"])
        let ids = Tokens.effectiveTiles(home, date: localDate(c["date"]?.stringValue ?? "")).map { JSONValue.string($0.id) }
        #expect(JSONValue.array(ids) == c["ids"], "\(c["date"]?.stringValue ?? "")")
    }
    for c in Extra.cases("moveTile") {
        let moved = Tokens.moveTile(Appearance.Home(), c["id"]?.stringValue ?? "", c["dir"]?.intValue ?? 0)
        #expect(JSONValue.array(moved.tiles.map { .string($0.id) }) == c["tiles"])
    }
    for c in Extra.cases("homeForSkin") {
        let home = Extra.startHomes[c["home"]?.intValue ?? 0]
        let skin: Appearance.Skin = c["skin"]?.stringValue == "signal" ? .signal : .classic
        #expect(Tokens.isDefaultHome(home) == c["isDefault"]?.boolValue)
        #expect(wire(Tokens.homeForSkin(home, skin)) == c["out"])
    }
    for c in Extra.cases("ordinals") {
        #expect(Tokens.ordinal(c["n"]?.intValue ?? 0) == c["s"]?.stringValue)
    }
}

@Test func extraPal() {
    for c in Extra.cases("palSay") {
        let pal = Extra.pals[c["pal"]?.intValue ?? 0]
        var vars: [String: String] = [:]
        for (k, v) in c["vars"]?.objectValue ?? [:] { vars[k] = v.stringValue }
        let key = c["key"]?.stringValue ?? ""
        #expect(Tokens.palSay(pal, key, vars) == c["out"]?.stringValue, "\(key) \(vars)")
    }
    for c in Extra.cases("palLine") {
        let pal = Extra.pals[c["pal"]?.intValue ?? 0]
        let task = c["task"]?.stringValue ?? ""
        #expect(Tokens.palLine(pal, task: task) == c["out"]?.stringValue, "task \(task)")
    }
    for c in Extra.cases("palInk") {
        let body = c["body"]?.stringValue ?? ""
        let acc = c["acc"]?.stringValue ?? ""
        #expect(Tokens.palFaceInk(body) == c["faceInk"]?.stringValue, "\(body)")
        #expect(Tokens.palVisor(body, acc) == c["visor"]?.stringValue, "\(body) \(acc)")
    }
    for c in Extra.cases("palDescription") {
        #expect(Tokens.palDescription(Tokens.normalizePal(c["pal"])) == c["out"]?.stringValue)
    }
}

@Test func extraColourMaths() {
    for c in Extra.cases("hsl") {
        let h = c["h"]?.doubleValue ?? 0
        let s = c["s"]?.doubleValue ?? 0
        let l = c["l"]?.doubleValue ?? 0
        #expect(Tokens.hslToHex(h, s, l) == c["hex"]?.stringValue, "h=\(h) s=\(s) l=\(l)")
    }
    for c in Extra.cases("hex") {
        let hex = c["hex"]?.stringValue ?? ""
        #expect(Tokens.hexToRgb(hex) == Extra.rgb(c["rgb"]), "\(hex)")
        #expect(Tokens.hueOf(hex) == c["hue"]?.intValue, "\(hex)")
        #expect(Tokens.isHex(hex) == c["isHex"]?.boolValue, "\(hex)")
    }
    for c in Extra.cases("pairs") {
        guard let a = Extra.rgb(c["a"]), let b = Extra.rgb(c["b"]) else {
            Issue.record("bad pair")
            continue
        }
        let ratio = c["ratio"]?.doubleValue ?? 0
        #expect(abs(Tokens.contrastRatio(a, b) - ratio) <= ratio * 1e-12, "\(a) \(b)")
        #expect(Tokens.fitContrast(a, b) == Extra.rgb(c["fit"]), "\(a) on \(b)")
        #expect(Tokens.fitContrast(a, b, min: 3) == Extra.rgb(c["fit3"]), "\(a) on \(b) at 3")
        #expect(Tokens.inkFor(a) == Extra.rgb(c["ink"]), "\(a)")
        #expect(Tokens.mix(a, b, 0.37) == Extra.rgb(c["mix"]), "\(a) \(b)")
    }
    for c in Extra.cases("alpha") {
        let alpha = c["alpha"]?.doubleValue ?? 0
        #expect(Tokens.withAlpha("#FF3D2E", alpha) == c["out"]?.stringValue, "\(alpha)")
    }
}

@Test func extraNamesPresetsLooks() {
    for c in Extra.cases("accentNames") {
        #expect(Tokens.accentName(c["hex"]?.stringValue ?? "") == c["name"]?.stringValue)
    }
    for c in Extra.cases("presets") {
        let sig = Tokens.normalizeSignal(c["sig"])
        #expect(Tokens.matchPreset(sig) == c["preset"]?.stringValue, "\(sig)")
    }
    for c in Extra.cases("looks") {
        let look = Extra.startLooks[c["look"]?.intValue ?? 0]
        let name = c["name"]?.stringValue ?? ""
        #expect(Tokens.matchLook(look) == c["match"]?.stringValue)
        let applied = Tokens.applyLook(look, name)
        #expect(Extra.lookRow(applied) == c["applied"], "\(name)")
        #expect(Tokens.matchLook(applied) == c["appliedMatch"]?.stringValue, "\(name)")
        #expect(Tokens.lookDescription(look.skin, name) == c["desc"]?.stringValue, "\(name)")
    }
    for c in Extra.cases("diff") {
        let a = Extra.startLooks[c["a"]?.intValue ?? 0]
        let b = Extra.startLooks[c["b"]?.intValue ?? 0]
        #expect(Tokens.diffAppearance(a, b) == Extra.rows(c["rows"]))
    }
}
