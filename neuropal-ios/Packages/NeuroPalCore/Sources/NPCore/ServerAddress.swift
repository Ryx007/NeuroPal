import Foundation

/// The server address the app talks to: typed on the sign-in screen or in
/// Settings, kept in UserDefaults (`np.apiHost`). Plain `http://` is
/// accepted only for the local network (a home server, Tailscale) — the
/// same places the app's App Transport Security exception covers.
public enum ServerAddress {
    public static let defaultsKey = "np.apiHost"
    public static var defaultHost: URL { AppSession.defaultHost }

    public enum Problem: Error, Equatable, Sendable, LocalizedError {
        case empty
        case invalid
        case unsupportedScheme(String)
        /// Plain http to an address outside the local network.
        case insecure

        public var errorDescription: String? {
            switch self {
            case .empty: return "Type the server address, like https://api.ryx007.work."
            case .invalid: return "That doesn’t look like a server address."
            case .unsupportedScheme: return "Use an address that starts with https://."
            case .insecure:
                return "Use https:// for this server. Plain http:// only works on your own network, like a home server or Tailscale."
            }
        }
    }

    /// A typed address → the server origin, or why it can't be used.
    /// "api.example.org" becomes https://api.example.org; a local address
    /// without a scheme ("192.168.1.20:4000") becomes http://. A trailing
    /// "/api" or "/" is dropped (the app adds /api itself).
    public static func parse(_ text: String) throws -> URL {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { throw Problem.empty }
        guard !s.contains(where: { $0.isWhitespace }) else { throw Problem.invalid }
        if s.range(of: "://") == nil {
            let authority = s.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? s
            let hostOnly = authority.split(separator: ":", maxSplits: 1).first.map(String.init) ?? authority
            s = (isLocalNetwork(host: hostOnly) ? "http://" : "https://") + s
        }
        guard var c = URLComponents(string: s), let scheme = c.scheme?.lowercased(),
              let host = c.host?.lowercased(), !host.isEmpty else { throw Problem.invalid }
        guard scheme == "https" || scheme == "http" else { throw Problem.unsupportedScheme(scheme) }
        guard c.user == nil, c.password == nil else { throw Problem.invalid }
        guard host.range(of: "^[a-z0-9.\\-_]+$", options: .regularExpression) != nil,
              !host.hasPrefix("."), !host.hasPrefix("-") else { throw Problem.invalid }
        if scheme == "http" && !isLocalNetwork(host: host) { throw Problem.insecure }

        c.scheme = scheme
        c.host = host
        c.query = nil
        c.fragment = nil
        var path = c.path
        while path.hasSuffix("/") { path.removeLast() }
        if path.lowercased().hasSuffix("/api") { path.removeLast(4) }
        while path.hasSuffix("/") { path.removeLast() }
        c.path = path
        if (scheme == "https" && c.port == 443) || (scheme == "http" && c.port == 80) { c.port = nil }
        guard let url = c.url else { throw Problem.invalid }
        return url
    }

    /// The validated address, or nil (with a reason) — for forms.
    public static func validate(_ text: String) -> Result<URL, Problem> {
        do { return .success(try parse(text)) } catch let p as Problem { return .failure(p) } catch {
            return .failure(.invalid)
        }
    }

    /// On this device's own network: loopback, private IPv4 ranges,
    /// link-local, `*.local` (Bonjour) and Tailscale's 100.64.0.0/10.
    public static func isLocalNetwork(host: String) -> Bool {
        kind(ofHost: host) != .internet
    }

    /// What kind of address a server has. Plain http:// is allowed for every
    /// kind except `.internet`; a saved session remembers the kind it was
    /// made for, and its token is never sent over http to another kind.
    public enum Kind: String, Codable, Sendable, CaseIterable {
        /// This device (localhost, 127.0.0.0/8, ::1).
        case loopback
        /// A private network (10/8, 172.16/12, 192.168/16).
        case privateNetwork
        /// Link-local (169.254.0.0/16).
        case linkLocal
        /// A Bonjour name (`*.local`).
        case bonjour
        /// Tailscale (100.64.0.0/10 — also used by carriers for CGNAT).
        case tailscale
        /// Anything else: only https.
        case internet
    }

    public static func kind(ofHost host: String) -> Kind {
        let h = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        if h == "localhost" || h.hasSuffix(".localhost") || h == "::1" { return .loopback }
        if h.hasSuffix(".local"), h.count > ".local".count { return .bonjour }
        guard let ip = ipv4(h) else { return .internet }
        switch (ip[0], ip[1]) {
        case (127, _): return .loopback
        case (10, _), (192, 168), (172, 16...31): return .privateNetwork
        case (169, 254): return .linkLocal
        case (100, 64...127): return .tailscale
        default: return .internet
        }
    }

    public static func kind(of url: URL) -> Kind { kind(ofHost: url.host ?? "") }

    /// Plain http:// — nothing on the way is encrypted.
    public static func isUnencrypted(_ url: URL) -> Bool { url.scheme?.lowercased() == "http" }

    /// "api.ryx007.work", "192.168.1.20:4000" — what the screens show.
    public static func label(_ url: URL) -> String {
        var s = url.host ?? url.absoluteString
        if let port = url.port { s += ":\(port)" }
        let path = url.path
        if !path.isEmpty, path != "/" { s += path }
        return url.scheme == "http" ? "http://" + s : s
    }

    // MARK: Saved address

    /// The saved address (re-validated), or nil for the default.
    public static func saved(in defaults: UserDefaults) -> URL? {
        guard let raw = defaults.string(forKey: defaultsKey) else { return nil }
        return try? parse(raw)
    }

    /// Keeps `url`; the default address is stored as "no override".
    public static func save(_ url: URL, in defaults: UserDefaults) {
        if AppSession.origin(url) == AppSession.origin(defaultHost), url.path.isEmpty || url.path == "/" {
            defaults.removeObject(forKey: defaultsKey)
        } else {
            defaults.set(url.absoluteString, forKey: defaultsKey)
        }
    }

    // MARK: -

    private static func ipv4(_ s: String) -> [Int]? {
        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return nil }
        var out: [Int] = []
        for p in parts {
            guard !p.isEmpty, p.count <= 3, p.allSatisfy(\.isASCII), p.allSatisfy(\.isNumber),
                  let v = Int(p), (0...255).contains(v) else { return nil }
            out.append(v)
        }
        return out
    }
}
