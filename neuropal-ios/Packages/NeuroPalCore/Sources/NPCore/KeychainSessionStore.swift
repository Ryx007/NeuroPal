import Foundation
import Security

/// Reads and writes one Keychain item. The app uses `SystemKeychain`; the
/// tests use memory (a test run must not touch the Mac's own Keychain).
public protocol KeychainBackend: Sendable {
    func read(service: String, account: String) -> Data?
    @discardableResult func write(_ data: Data, service: String, account: String) -> Bool
    func delete(service: String, account: String)
}

/// A generic-password item, readable after the first unlock (background
/// refreshes), never synced or restored onto another device.
public struct SystemKeychain: KeychainBackend {
    public init() {}

    private func query(_ service: String, _ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    public func read(service: String, account: String) -> Data? {
        var q = query(service, account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess else { return nil }
        return out as? Data
    }

    @discardableResult
    public func write(_ data: Data, service: String, account: String) -> Bool {
        let q = query(service, account)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(q as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(q.merging(attributes) { _, new in new } as CFDictionary, nil)
        }
        return status == errSecSuccess
    }

    public func delete(service: String, account: String) {
        SecItemDelete(query(service, account) as CFDictionary)
    }
}

/// The app's session store: ONE Keychain record `{host, token, user}`,
/// bound to the server origin it came from (a session for another host is
/// never returned). The "signed out on purpose" flag lives in UserDefaults.
public final class KeychainSessionStore: SessionStore, @unchecked Sendable {
    public static let service = "io.neuropal.ios.session"
    public static let account = "session"
    public static let signedOutKey = "np.signedOut"
    /// Keychain items outlive an uninstall; UserDefaults don't. A fresh
    /// install starts signed out instead of finding an old session.
    static let installedKey = "np.installed"

    private let keychain: any KeychainBackend
    private let defaults: UserDefaults
    private let service: String
    private let lock = NSLock()

    /// Touches neither the Keychain nor the defaults: the app may be built
    /// during prewarming, before the first unlock, when both read as empty.
    /// Call `forgetSessionFromAnEarlierInstall()` at boot.
    public init(defaults: UserDefaults = .standard, keychain: any KeychainBackend = SystemKeychain(),
                service: String = KeychainSessionStore.service) {
        self.defaults = defaults
        self.keychain = keychain
        self.service = service
    }

    /// A fresh install starts signed out: a session left in the Keychain by
    /// an earlier install of the app (Keychain items outlive an uninstall;
    /// UserDefaults don't) is deleted, once. Call it at boot, before the
    /// first `load`, and only while the device's protected data is
    /// available — before the first unlock the defaults read as empty and
    /// every install would look fresh.
    public func forgetSessionFromAnEarlierInstall() {
        lock.withLock {
            guard !defaults.bool(forKey: Self.installedKey) else { return }
            keychain.delete(service: service, account: Self.account)
            defaults.set(true, forKey: Self.installedKey)
        }
    }

    public func load(host: URL) -> StoredSession? {
        lock.withLock {
            guard let record = record(), record.host == AppSession.origin(host) else { return nil }
            return record
        }
    }

    public func save(_ session: StoredSession) {
        lock.withLock {
            guard let data = try? JSONEncoder.neuropal.encode(session) else { return }
            keychain.write(data, service: service, account: Self.account)
            defaults.removeObject(forKey: Self.signedOutKey)
        }
    }

    public func clear(host: URL) {
        lock.withLock {
            let stored = keychain.read(service: service, account: Self.account)
            if stored != nil {
                // This host's session goes; another host's stays for when the
                // app is pointed back at it. An unreadable record goes too.
                let record = stored.flatMap { try? JSONDecoder.neuropal.decode(StoredSession.self, from: $0) }
                if record == nil || record?.host == AppSession.origin(host) {
                    keychain.delete(service: service, account: Self.account)
                }
            }
            defaults.set(true, forKey: Self.signedOutKey)
        }
    }

    public var wasSignedOut: Bool { defaults.bool(forKey: Self.signedOutKey) }

    private func record() -> StoredSession? {
        guard let data = keychain.read(service: service, account: Self.account) else { return nil }
        return try? JSONDecoder.neuropal.decode(StoredSession.self, from: data)
    }
}

/// An in-memory Keychain, for tests and previews.
public final class MemoryKeychain: KeychainBackend, @unchecked Sendable {
    private let lock = NSLock()
    private var items: [String: Data] = [:]

    public init() {}

    public func read(service: String, account: String) -> Data? {
        lock.withLock { items["\(service)/\(account)"] }
    }

    @discardableResult
    public func write(_ data: Data, service: String, account: String) -> Bool {
        lock.withLock { items["\(service)/\(account)"] = data }
        return true
    }

    public func delete(service: String, account: String) {
        _ = lock.withLock { items.removeValue(forKey: "\(service)/\(account)") }
    }
}
