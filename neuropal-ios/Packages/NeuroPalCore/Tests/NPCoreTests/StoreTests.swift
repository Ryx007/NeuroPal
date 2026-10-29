import Foundation
import Testing
@testable import NPCore

/// A throwaway UserDefaults domain, removed afterwards.
final class TestDefaults {
    let name = "np-tests-\(UUID().uuidString)"
    let defaults: UserDefaults

    init() { defaults = UserDefaults(suiteName: name)! }
    deinit { defaults.removePersistentDomain(forName: name) }
}

@Suite("Saved session (Keychain record, host-bound)")
struct KeychainStoreTests {
    let a = URL(string: "https://api.ryx007.work")!
    let b = URL(string: "http://192.168.3.169:4000")!

    @Test func aSessionIsOnlyEverReturnedForItsOwnServer() {
        let d = TestDefaults()
        let store = KeychainSessionStore(defaults: d.defaults, keychain: MemoryKeychain())
        store.save(StoredSession(host: AppSession.origin(a), token: "tok-a", user: NPUser(id: "1", email: "r@x.y")))
        #expect(store.load(host: a)?.token == "tok-a")
        #expect(store.load(host: URL(string: "https://API.ryx007.work/")!)?.token == "tok-a")
        #expect(store.load(host: b) == nil)
        #expect(store.load(host: URL(string: "http://api.ryx007.work")!) == nil)
        #expect(store.load(host: URL(string: "https://api.ryx007.work:8443")!) == nil)
        #expect(store.load(host: URL(string: "https://evil.example")!) == nil)
    }

    @Test func clearingAnotherServerKeepsThisOneButRemembersTheSignOut() {
        let d = TestDefaults()
        let store = KeychainSessionStore(defaults: d.defaults, keychain: MemoryKeychain())
        store.save(StoredSession(host: AppSession.origin(a), token: "tok-a"))
        #expect(!store.wasSignedOut)
        store.clear(host: b)
        #expect(store.load(host: a)?.token == "tok-a")
        #expect(store.wasSignedOut)
        store.clear(host: a)
        #expect(store.load(host: a) == nil)
        store.save(StoredSession(host: AppSession.origin(b), token: "tok-b"))
        #expect(!store.wasSignedOut)
    }

    @Test func theRecordLivesInTheKeychainNotInDefaults() throws {
        let d = TestDefaults()
        let keychain = MemoryKeychain()
        let store = KeychainSessionStore(defaults: d.defaults, keychain: keychain)
        store.save(StoredSession(host: AppSession.origin(a), token: "secret-token"))
        let data = try #require(keychain.read(service: KeychainSessionStore.service, account: KeychainSessionStore.account))
        #expect(String(decoding: data, as: UTF8.self).contains("secret-token"))
        let everything = d.defaults.dictionaryRepresentation().description
        #expect(!everything.contains("secret-token"))
    }

    @Test func aFreshInstallStartsWithoutAnOldSession() throws {
        let keychain = MemoryKeychain()
        let old = try JSONEncoder.neuropal.encode(StoredSession(host: AppSession.origin(a), token: "from-before"))
        keychain.write(old, service: KeychainSessionStore.service, account: KeychainSessionStore.account)
        let d = TestDefaults()
        let store = KeychainSessionStore(defaults: d.defaults, keychain: keychain)
        #expect(store.load(host: a) == nil)
        // …but a relaunch of the same install keeps what it saved.
        store.save(StoredSession(host: AppSession.origin(a), token: "now"))
        let again = KeychainSessionStore(defaults: d.defaults, keychain: keychain)
        #expect(again.load(host: a)?.token == "now")
    }

    @Test func anUnreadableRecordIsDropped() {
        let keychain = MemoryKeychain()
        let d = TestDefaults()
        let store = KeychainSessionStore(defaults: d.defaults, keychain: keychain)
        keychain.write(Data("not json".utf8), service: KeychainSessionStore.service, account: KeychainSessionStore.account)
        #expect(store.load(host: a) == nil)
        store.clear(host: a)
        #expect(keychain.read(service: KeychainSessionStore.service, account: KeychainSessionStore.account) == nil)
    }

    @Test func memoryStoreFollowsTheSameRules() {
        let store = MemorySessionStore(StoredSession(host: "https://api.ryx007.work", token: "t"))
        #expect(store.load(host: a)?.token == "t")
        #expect(store.load(host: b) == nil)
        store.clear(host: b)
        #expect(store.load(host: a)?.token == "t")
        #expect(store.wasSignedOut)
    }
}

@Suite("Server address")
struct ServerAddressTests {
    @Test(arguments: [
        ("https://api.ryx007.work", "https://api.ryx007.work"),
        ("  https://api.ryx007.work/  ", "https://api.ryx007.work"),
        ("https://api.ryx007.work/api", "https://api.ryx007.work"),
        ("https://api.ryx007.work/api/", "https://api.ryx007.work"),
        ("HTTPS://API.Ryx007.Work", "https://api.ryx007.work"),
        ("api.ryx007.work", "https://api.ryx007.work"),
        ("https://api.ryx007.work:443", "https://api.ryx007.work"),
        ("https://example.org:8443/neuropal", "https://example.org:8443/neuropal"),
        ("https://example.org/?x=1#y", "https://example.org"),
        ("http://192.168.3.169:4000", "http://192.168.3.169:4000"),
        ("192.168.3.169:4000", "http://192.168.3.169:4000"),
        ("http://localhost:4100", "http://localhost:4100"),
        ("localhost:4100", "http://localhost:4100"),
        ("http://127.0.0.1:4000", "http://127.0.0.1:4000"),
        ("http://10.0.0.5", "http://10.0.0.5"),
        ("http://172.16.0.1:4000", "http://172.16.0.1:4000"),
        ("http://172.31.255.254", "http://172.31.255.254"),
        ("http://ryx-mac-mini.local:4000", "http://ryx-mac-mini.local:4000"),
        ("http://100.80.166.68:4000", "http://100.80.166.68:4000"),
        ("http://100.64.0.1", "http://100.64.0.1"),
        ("http://100.127.255.255", "http://100.127.255.255"),
    ])
    func accepted(_ input: String, _ expected: String) throws {
        #expect(try ServerAddress.parse(input).absoluteString == expected)
    }

    @Test(arguments: [
        ("", ServerAddress.Problem.empty),
        ("   ", .empty),
        ("http://api.ryx007.work", .insecure),
        ("http://example.com:4000", .insecure),
        ("http://8.8.8.8", .insecure),
        ("http://172.15.0.1", .insecure),
        ("http://172.32.0.1", .insecure),
        ("http://100.128.0.1", .insecure),
        ("http://100.63.255.255", .insecure),
        ("http://192.169.0.1", .insecure),
        ("http://ryx-mac-mini.tail73ed8.ts.net", .insecure),
        ("ftp://api.ryx007.work", .unsupportedScheme("ftp")),
        ("https://", .invalid),
        ("https://exa mple.org", .invalid),
        ("https://user:pw@example.org", .invalid),
        ("not a url", .invalid),
    ])
    func refused(_ input: String, _ problem: ServerAddress.Problem) {
        #expect(ServerAddress.validate(input) == .failure(problem))
        #expect(problem.errorDescription?.isEmpty == false)
    }

    @Test func localNetworkRanges() {
        for host in ["localhost", "127.0.0.1", "127.8.0.1", "10.1.2.3", "172.16.5.4", "192.168.0.1", "mini.local", "100.64.0.0", "100.127.1.1", "::1"] {
            #expect(ServerAddress.isLocalNetwork(host: host), "\(host)")
        }
        for host in ["api.ryx007.work", "8.8.8.8", "100.128.0.0", "172.32.0.1", "local", ".local", "192.168.1", "256.1.1.1", "1.2.3.4.5"] {
            #expect(!ServerAddress.isLocalNetwork(host: host), "\(host)")
        }
    }

    @Test func savedAddress() {
        let d = TestDefaults()
        #expect(ServerAddress.saved(in: d.defaults) == nil)
        ServerAddress.save(URL(string: "http://192.168.3.169:4000")!, in: d.defaults)
        #expect(ServerAddress.saved(in: d.defaults)?.absoluteString == "http://192.168.3.169:4000")
        #expect(d.defaults.string(forKey: ServerAddress.defaultsKey) == "http://192.168.3.169:4000")
        // The default is stored as "no override".
        ServerAddress.save(AppSession.defaultHost, in: d.defaults)
        #expect(d.defaults.string(forKey: ServerAddress.defaultsKey) == nil)
        // Something unusable in the defaults is ignored.
        d.defaults.set("http://evil.example", forKey: ServerAddress.defaultsKey)
        #expect(ServerAddress.saved(in: d.defaults) == nil)
    }

    @Test func labels() {
        #expect(ServerAddress.label(URL(string: "https://api.ryx007.work")!) == "api.ryx007.work")
        #expect(ServerAddress.label(URL(string: "http://192.168.3.169:4000")!) == "http://192.168.3.169:4000")
        #expect(ServerAddress.label(URL(string: "https://example.org/neuropal")!) == "example.org/neuropal")
    }
}

@Suite("Deep links")
struct DeepLinkTests {
    @Test func everyPlace() {
        #expect(DeepLink.route(for: URL(string: "neuropal://calm")!) == .calm)
        #expect(DeepLink.route(for: URL(string: "NEUROPAL://calm")!) == .calm)
        #expect(DeepLink.route(for: URL(string: "neuropal://pal")!) == .pal(nil))
        #expect(DeepLink.route(for: URL(string: "neuropal://pal?tool=breakdown")!) == .pal(.breakdown))
        #expect(DeepLink.route(for: URL(string: "neuropal://pal?tool=nonsense")!) == .pal(nil))
        #expect(DeepLink.route(for: URL(string: "neuropal://home")!) == .tab(.home))
        #expect(DeepLink.route(for: URL(string: "neuropal://library")!) == .tab(.library))
        #expect(DeepLink.route(for: URL(string: "neuropal://settings")!) == .tab(.settings))
        #expect(DeepLink.route(for: URL(string: "neuropal://read?doc=64F0C0FFEE00000000000001")!)
            == .reader(documentID: "64F0C0FFEE00000000000001"))
    }

    @Test func refusesAnythingElse() {
        #expect(DeepLink.route(for: URL(string: "neuropal://read")!) == nil)
        #expect(DeepLink.route(for: URL(string: "neuropal://read?doc=123")!) == nil)
        #expect(DeepLink.route(for: URL(string: "neuropal://read?doc=../../etc/passwd")!) == nil)
        #expect(DeepLink.route(for: URL(string: "neuropal://checkin?state=red")!) == nil)
        #expect(DeepLink.route(for: URL(string: "https://calm")!) == nil)
        #expect(DeepLink.route(for: URL(string: "neuropal:")!) == nil)
    }

    @Test func linksRoundTrip() {
        let routes: [NPRoute] = [.calm, .pal(nil), .pal(.talk), .reader(documentID: "64f0c0ffee00000000000001"),
                                 .tab(.home), .tab(.library), .tab(.settings)]
        for route in routes {
            #expect(DeepLink.route(for: DeepLink.url(for: route)) == route)
        }
        // Ask opens through the reader link.
        #expect(DeepLink.route(for: DeepLink.url(for: .ask(documentID: "64f0c0ffee00000000000001")))
            == .reader(documentID: "64f0c0ffee00000000000001"))
    }

    @MainActor
    @Test func theNavigatorFollowsRoutes() {
        let nav = AppNavigator()
        nav.open(.ask(documentID: "d"))
        #expect(nav.tab == .library && nav.openDocumentID == "d" && nav.askOpen)
        nav.open(.reader(documentID: "e"))
        #expect(nav.openDocumentID == "e" && !nav.askOpen)
        nav.open(.pal(.sit))
        #expect(nav.palOpen && nav.palTool == .sit)
        nav.open(.calm)
        #expect(nav.calmOpen && !nav.palOpen)
        nav.open(.tab(.settings))
        #expect(nav.tab == .settings)
    }
}
