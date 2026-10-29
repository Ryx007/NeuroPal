import CoreText
import Foundation
import SwiftUI
import UIKit
import WebKit

/// One chapter's token stream, as the in-page runtime reports it.
struct EpubTokens: Equatable {
    var words: [String]
    /// "w" word · "eq" equation image · "img" figure
    var kinds: [String]
    /// Paragraph ordinal per token.
    var pids: [Int]
    /// Print pages that start in this chapter: label + first token.
    var pageAnchors: [PageAnchor]

    struct PageAnchor: Equatable {
        var page: String
        var index: Int
    }

    var isEmpty: Bool { words.isEmpty }

    func clamp(_ i: Int) -> Int { min(max(0, i), max(0, words.count - 1)) }

    func paragraphStart(before i: Int) -> Int {
        let w = clamp(i)
        let pid = pids.indices.contains(w) ? pids[w] : 0
        var start = w
        while start > 0, pids[start - 1] == pid { start -= 1 }
        if w - start > 1 || start == 0 { return start }
        let prev = pids[start - 1]
        var s = start - 1
        while s > 0, pids[s - 1] == prev { s -= 1 }
        return s
    }

    func paragraphStart(after i: Int) -> Int? {
        let w = clamp(i)
        guard pids.indices.contains(w) else { return nil }
        let pid = pids[w]
        var j = w + 1
        while j < pids.count, pids[j] == pid { j += 1 }
        return j < pids.count ? j : nil
    }

    func sentenceStart(before i: Int) -> Int {
        let w = clamp(i)
        var s = w
        while s > 0, !ends(s - 1), pids[s - 1] == pids[s] { s -= 1 }
        if w - s > 1 || s == 0 { return s }
        var p = s - 1
        while p > 0, !ends(p - 1), pids[p - 1] == pids[p] { p -= 1 }
        return p
    }

    func sentenceStart(after i: Int) -> Int? {
        var j = clamp(i)
        while j + 1 < words.count {
            if ends(j) || pids[j + 1] != pids[j] { return j + 1 }
            j += 1
        }
        return nil
    }

    private func ends(_ i: Int) -> Bool { ReadingText.endsSentence(words[i]) }

    /// What the voice says per token: words as written, "equation" for
    /// equation images, figures silent.
    var speech: [String] {
        zip(words, kinds).map { word, kind in
            kind == "w" ? word : (kind == "eq" ? "equation" : "")
        }
    }

    /// Paragraph runs (long ones split at a sentence) as speech units.
    var units: [Range<Int>] {
        var out: [Range<Int>] = []
        var start = 0
        var i = 1
        while i <= words.count {
            let boundary = i == words.count || pids[i] != pids[i - 1]
            let long = i - start >= 90 && i < words.count && ends(i - 1)
            if boundary || long || i - start >= 220 {
                out.append(start..<i)
                start = i
            }
            i += 1
        }
        return out
    }

    /// The token where a quoted passage starts, if it's in this chapter.
    func index(matching excerpt: String) -> Int? {
        let needle = ReadingText.searchKey(excerpt)
        guard needle.count >= 6 else { return nil }
        let keys = words.map(ReadingText.searchKey)
        let joined = keys.joined(separator: " ")
        for length in [needle.count, 60, 30] where length <= needle.count {
            guard let r = joined.range(of: String(needle.prefix(length))) else { continue }
            let before = joined[..<r.lowerBound].split(separator: " ").count
            return clamp(before)
        }
        return nil
    }
}

enum EpubMessage {
    case tokens(EpubTokens)
    case tap(Int)
    case anchor(Int)
    case link(String)
    case selection(String?)
}

/// Commands into the page and messages out of it (script message handler,
/// isolated content world), plus the navigation policy: only the book's
/// own files may ever be the page.
@MainActor
final class EpubBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    weak var webView: WKWebView?
    var onMessage: (@MainActor (EpubMessage) -> Void)?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "tokens":
            let anchors = (body["pageAnchors"] as? [[String: Any]] ?? []).compactMap { a -> EpubTokens.PageAnchor? in
                guard let page = a["page"] as? String, let index = (a["index"] as? NSNumber)?.intValue else { return nil }
                return EpubTokens.PageAnchor(page: page, index: index)
            }
            let words = body["words"] as? [String] ?? []
            let kinds = body["kinds"] as? [String] ?? []
            let pids = (body["pids"] as? [NSNumber] ?? []).map(\.intValue)
            guard words.count == kinds.count, words.count == pids.count else { return }
            onMessage?(.tokens(EpubTokens(words: words, kinds: kinds, pids: pids, pageAnchors: anchors)))
        case "tap":
            if let i = (body["index"] as? NSNumber)?.intValue { onMessage?(.tap(i)) }
        case "anchor":
            if let i = (body["index"] as? NSNumber)?.intValue { onMessage?(.anchor(i)) }
        case "link":
            if let href = body["href"] as? String { onMessage?(.link(href)) }
        case "sel":
            onMessage?(.selection(body["text"] as? String))
        case "sel-clear":
            onMessage?(.selection(nil))
        default:
            break
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        let ours = navigationAction.request.url?.scheme == EpubRuntime.scheme
        decisionHandler(ours && navigationAction.navigationType != .linkActivated ? .allow : .cancel)
    }

    private func run(_ js: String) {
        webView?.evaluateJavaScript(js, in: nil, in: .defaultClient, completionHandler: nil)
    }

    func highlight(_ index: Int, scroll: Bool) {
        run("window.epubHighlight&&epubHighlight(\(index),\(scroll ? "true" : "false"))")
    }

    func seekAnchor(_ id: String) {
        run("window.epubSeekAnchor&&epubSeekAnchor(\(Self.json(id)))")
    }

    func setTheme(_ css: String) {
        run("window.epubTheme&&epubTheme(\(Self.json(css)))")
    }

    func clearSelection() {
        run("window.epubClearSelection&&epubClearSelection()")
    }

    static func json(_ s: String) -> String {
        guard let data = try? JSONEncoder().encode(s), let text = String(data: data, encoding: .utf8) else { return "\"\"" }
        return text
    }
}

/// Serves the book's files to the web view under npbook://book/<path>:
/// chapter documents wrapped with the policy and theme, everything else as
/// is — only from inside the book's folder (server or bundled sample), and
/// the reader font from the app bundle.
@MainActor
final class EpubSchemeHandler: NSObject, WKURLSchemeHandler {
    /// The book's folder (ends with "/").
    var base: URL?
    var themeCSS = ""
    /// PostScript name of the reading font.
    var fontName: String?
    private var running = Set<ObjectIdentifier>()
    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.httpCookieStorage = nil
        config.timeoutIntervalForRequest = 30
        return URLSession(configuration: config)
    }()

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        let id = ObjectIdentifier(urlSchemeTask)
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let isMain = urlSchemeTask.request.mainDocumentURL == url
        running.insert(id)
        Task {
            do {
                let (data, mime) = try await self.load(EpubRuntime.path(of: url), isMain: isMain)
                guard self.running.contains(id) else { return }
                var headers = ["Content-Type": mime, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"]
                if isMain { headers["Content-Security-Policy"] = EpubRuntime.csp }
                let response: URLResponse = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                                            headerFields: headers)
                    ?? URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: nil)
                urlSchemeTask.didReceive(response)
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
            } catch {
                guard self.running.contains(id) else { return }
                urlSchemeTask.didFailWithError(error)
            }
            self.running.remove(id)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {
        running.remove(ObjectIdentifier(urlSchemeTask))
    }

    private func load(_ path: String, isMain: Bool) async throws -> (Data, String) {
        if path.hasPrefix("__np__/font/") { return try readerFont() }
        guard let base, let target = URL(string: path, relativeTo: base)?.absoluteURL.standardized,
              target.absoluteString.hasPrefix(base.standardized.absoluteString) else {
            throw URLError(.noPermissionsToReadFile)
        }
        let data: Data
        if target.isFileURL {
            data = try await Task.detached { try Data(contentsOf: target) }.value
        } else {
            let (body, response) = try await session.data(from: target)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                throw URLError(.badServerResponse)
            }
            data = body
        }
        if isMain {
            let html = EpubRuntime.chapterHTML(String(decoding: data, as: UTF8.self), themeCSS: themeCSS)
            return (Data(html.utf8), "text/html; charset=utf-8")
        }
        return (data, Self.mimeType(path))
    }

    private func readerFont() throws -> (Data, String) {
        guard let name = fontName else { throw URLError(.fileDoesNotExist) }
        let font = CTFontCreateWithName(name as CFString, 16, nil)
        guard CTFontCopyPostScriptName(font) as String == name,
              let url = CTFontCopyAttribute(font, kCTFontURLAttribute) as? URL else { throw URLError(.fileDoesNotExist) }
        return (try Data(contentsOf: url), url.pathExtension.lowercased() == "otf" ? "font/otf" : "font/ttf")
    }

    static func mimeType(_ path: String) -> String {
        let ext = (path.split(separator: "?").first.map(String.init) ?? path).split(separator: ".").last?.lowercased() ?? ""
        switch ext {
        case "xhtml", "html", "htm": return "text/html; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "svg": return "image/svg+xml"
        case "webp": return "image/webp"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "mp3": return "audio/mpeg"
        case "mp4", "m4v": return "video/mp4"
        case "xml", "ncx", "opf": return "application/xml"
        default: return "application/octet-stream"
        }
    }
}

/// The chapter view: a WKWebView with the page's JavaScript off and our
/// runtime in its own content world.
struct EpubWebView: UIViewRepresentable {
    let model: EpubModel
    let background: UIColor

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(model.handler, forURLScheme: EpubRuntime.scheme)
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.dataDetectorTypes = []
        config.mediaTypesRequiringUserActionForPlayback = .all
        config.userContentController.add(model.bridge, contentWorld: .defaultClient, name: "np")
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = model.bridge
        web.isOpaque = false
        web.backgroundColor = background
        web.scrollView.backgroundColor = background
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false
        model.bridge.webView = web
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        if web.backgroundColor != background {
            web.backgroundColor = background
            web.scrollView.backgroundColor = background
        }
        guard context.coordinator.loadedID != model.loadID, let url = model.chapterURL else { return }
        context.coordinator.loadedID = model.loadID
        let controller = web.configuration.userContentController
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(source: EpubRuntime.script(pageAnchorsJSON: model.pageAnchorsJSON),
                                              injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .defaultClient))
        web.load(URLRequest(url: url))
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.stopLoading()
        web.configuration.userContentController.removeAllScriptMessageHandlers()
    }

    final class Coordinator {
        var loadedID = -1
    }
}
