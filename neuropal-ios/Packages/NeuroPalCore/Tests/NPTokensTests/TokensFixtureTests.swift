import Foundation
import Testing
@testable import NPTokens

/// The cross-language contract: packages/tokens/fixtures/cases.json, copied
/// here by packages/tokens/scripts/sync.js. Every case the JS computes, the
/// Swift port must reproduce exactly.
struct Fixtures: Decodable {
    struct PaletteCase: Decodable {
        let input: JSONValue
        let output: Palette
    }

    let tokensVersion: Int
    let classic: [PaletteCase]
    let signal: [PaletteCase]
    let interpretAppearance: [JSONValue]
    let interpretHome: [JSONValue]
    let effectiveTiles: [JSONValue]
    let pal: [JSONValue]

    static let shared: Fixtures = {
        let url = Bundle.module.url(forResource: "cases", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONDecoder().decode(Fixtures.self, from: Data(contentsOf: url))
    }()
}

@Test func fixturesLoad() {
    let f = Fixtures.shared
    #expect(f.tokensVersion == Tokens.version)
    #expect(f.classic.count == 16)
    #expect(f.signal.count > 30)
}

@Test func tokenDataLoads() {
    #expect(Tokens.data["classicThemeNames"]?.arrayValue?.count == 4)
}

@Test func defaultPalettesMatchTheFixtures() {
    let f = Fixtures.shared
    // classic[0] is dark + ruby, signal[0] the Signal default preset.
    #expect(f.classic[0].output == Palette.classicDefault)
    #expect(f.signal[0].output == Palette.signalDefault)
}
