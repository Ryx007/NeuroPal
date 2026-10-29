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
        store.forgetSessionFromAnEarlierInstall()
        #expect(store.load(host: a) == nil)
        // …but a relaunch of the same install keeps what it saved.
        store.save(StoredSession(host: AppSession.origin(a), token: "now"))
        let again = KeychainSessionStore(defaults: d.defaults, keychain: keychain)
        again.forgetSessionFromAnEarlierInstall()
        #expect(again.load(host: a)?.token == "now")
    }

    @Test func buildingTheStoreTouchesNothing() throws {
        // App.init can run during prewarming, before the first unlock: the
        // store must not judge "fresh install" (or delete anything) then.
        let keychain = MemoryKeychain()
        let saved = try JSONEncoder.neuropal.encode(StoredSession(host: AppSession.origin(a), token: "keep-me"))
        keychain.write(saved, service: KeychainSessionStore.service, account: KeychainSessionStore.account)
        let d = TestDefaults()
        let store = KeychainSessionStore(defaults: d.defaults, keychain: keychain)
        #expect(store.load(host: a)?.token == "keep-me")
        #expect(d.defaults.object(forKey: KeychainSessionStore.installedKey) == nil)
    }

    @Test func aSessionRemembersTheKindOfAddressItWasMadeFor() throws {
        let lan = URL(string: "http://192.168.3.169:4000")!
        let record = StoredSession(host: AppSession.origin(lan), token: "t")
        #expect(record.kind == .privateNetwork)
        #expect(record.isUsable(for: lan))
        // Over plain http, never to another kind of address.
        var other = record
        other.kind = .tailscale
        #expect(!other.isUsable(for: lan))
        // Records saved before the kind was kept still work…
        other.kind = nil
        #expect(other.isUsable(for: lan))
        // …and https is bound by its origin alone.
        var secure = StoredSession(host: AppSession.origin(a), token: "t")
        #expect(secure.kind == .internet)
        secure.kind = .bonjour
        #expect(secure.isUsable(for: a))
        // An older record without the field decodes.
        let legacy = #"{"host":"http://192.168.3.169:4000","token":"t"}"#
        let decoded = try JSONDecoder.neuropal.decode(StoredSession.self, from: Data(legacy.utf8))
        #expect(decoded.kind == nil)
        #expect(decoded.isUsable(for: lan))
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
        for host in ["localhost", "127.0.0.1", "127.8.0.1", "10.1.2.3", "172.16.5.4", "192.168.0.1", "mini.local", "100.64.0.0",
                     "100.127.1.1", "::1", "169.254.10.20"] {
            #expect(ServerAddress.isLocalNetwork(host: host), "\(host)")
        }
        for host in ["api.ryx007.work", "8.8.8.8", "100.128.0.0", "172.32.0.1", "local", ".local", "192.168.1", "256.1.1.1",
                     "1.2.3.4.5", "169.253.0.1", "169.255.0.1"] {
            #expect(!ServerAddress.isLocalNetwork(host: host), "\(host)")
        }
    }

    @Test func kindsOfAddress() throws {
        let kinds: [(String, ServerAddress.Kind)] = [
            ("localhost", .loopback), ("127.0.0.1", .loopback), ("::1", .loopback), ("10.0.0.5", .privateNetwork),
            ("172.20.1.1", .privateNetwork), ("192.168.3.169", .privateNetwork), ("169.254.1.1", .linkLocal),
            ("mini.local", .bonjour), ("100.80.166.68", .tailscale), ("api.ryx007.work", .internet), ("8.8.8.8", .internet),
        ]
        for (host, kind) in kinds {
            #expect(ServerAddress.kind(ofHost: host) == kind, "\(host)")
        }
        #expect(ServerAddress.kind(of: URL(string: "http://169.254.7.7:4000")!) == .linkLocal)
        #expect(try ServerAddress.parse("169.254.7.7:4000").absoluteString == "http://169.254.7.7:4000")
        #expect(ServerAddress.isUnencrypted(URL(string: "http://192.168.1.2")!))
        #expect(!ServerAddress.isUnencrypted(URL(string: "https://api.ryx007.work")!))
    }

    /// Percent-escaped and non-ASCII paths: whatever `parse` accepts, the
    /// client can build every request from (it used to trap at launch).
    @Test(arguments: ["https://example.com/a%20b", "https://example.com/a%25b", "https://example.com/caf%C3%A9",
                      "https://example.com/über", "https://example.com/%7E/x", "https://example.com/a;b@c",
                      "http://192.168.1.20:4000/np%2Fx", "https://example.com/a%2"])
    func escapedServerPathsBuildRequests(_ address: String) throws {
        guard let host = try? ServerAddress.parse(address) else { return } // refused: never saved, never used
        let api = HTTPNeuroPalAPI(host: host, token: "t")
        let page = api.pageImageURL(documentID: "a b/c", page: 2, ticket: "x y")
        #expect(page.absoluteString.hasPrefix(host.absoluteString + "/api/documents/a%20b%2Fc/page/2"), "\(page)")
        #expect(URLComponents(url: page, resolvingAgainstBaseURL: false)?.percentEncodedQuery == "t=x%20y")
        let r = try api.request("GET", "/documents")
        #expect(r.url?.absoluteString == host.absoluteString + "/api/documents")
        #expect(api.epubBaseURL(documentID: "d", ticket: nil).absoluteString == host.absoluteString + "/api/documents/d/epub/")
    }

    @Test func pathsAreAlwaysValidlyEncoded() {
        #expect(HTTPNeuroPalAPI.pathEncoded("/a b/%zz/%41/é/%") == "/a%20b/%25zz/%41/%C3%A9/%25")
        #expect(HTTPNeuroPalAPI.pathEncoded("/api/documents/64f0/epub/t/a.b.c/") == "/api/documents/64f0/epub/t/a.b.c/")
        #expect(HTTPNeuroPalAPI.pathEncoded("/x;y=1/@:!$&'()*+,") == "/x;y=1/@:!$&'()*+,")
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

@Suite("Launch arguments")
struct DebugLaunchTests {
    @Test func readFromThisLaunchOnly() {
        let args = ["/app", "-NPMock", "1", "-NPScreen", "reader", "-NPPalTask", "Write the intro", "-NPLast"]
        #expect(DebugLaunch.value("NPMock", in: args) == "1")
        #expect(DebugLaunch.value("NPScreen", in: args) == "reader")
        #expect(DebugLaunch.value("NPPalTask", in: args) == "Write the intro")
        #expect(DebugLaunch.value("NPLast", in: args) == nil)
        #expect(DebugLaunch.value("NPMissing", in: args) == nil)
        // The first entry is the program itself.
        #expect(DebugLaunch.value("app", in: ["-app", "x"]) == nil)
        // A test run passes none of them, whatever the saved settings hold.
        UserDefaults.standard.set(true, forKey: "NPMock")
        defer { UserDefaults.standard.removeObject(forKey: "NPMock") }
        #expect(!DebugLaunch.mock)
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

@Suite("What an account leaves behind")
struct AccountTracesTests {
    @Test func signingOutRemovesTheAccountsTemporaryFilesOnly() throws {
        let fm = FileManager.default
        let folder = fm.temporaryDirectory.appending(path: "np-traces-\(UUID().uuidString)")
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: folder) }
        let theirs = ["np-original-0123456789abcdef01234567.pdf", "np-download-1.tmp", "np-upload-2.body"]
        let others = ["day-backup.json", "np-originals-notes.txt", "other.pdf"]
        for name in theirs + others { try Data("x".utf8).write(to: folder.appending(path: name)) }
        try fm.createDirectory(at: folder.appending(path: "np-uploads"), withIntermediateDirectories: true)
        try Data("x".utf8).write(to: folder.appending(path: "np-uploads/paper.pdf"))

        AccountTraces.removeTemporaryFiles(in: folder)

        let left = Set(try fm.contentsOfDirectory(atPath: folder.path))
        #expect(left == Set(others))
    }

    @Test func theSharedFilesAreTheReadingPositionAndPalsChat() {
        #expect(AccountTraces.sharedFiles.contains(ReadingSnapshot.fileName))
        #expect(AccountTraces.sharedFiles.contains("pal-chat.json"))
        // The day stays: it's the person's, not the account's.
        #expect(!AccountTraces.sharedFiles.contains("day.json"))
    }
}
