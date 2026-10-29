import Foundation
import UIKit
import WebKit

/// The words of the next chapters, ready before they're needed: each one
/// loaded ahead of time in a web view of its own that's never seen, with
/// the same runtime and the same cleaned chapter as the page, so the words
/// match the page's exactly. When a chapter ends, read-aloud carries
/// straight on from these words — with the phone locked too, when WebKit
/// won't load the page itself — and the page catches up when it can.
@MainActor
final class EpubReadAhead: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    struct Chapter: Equatable {
        let spine: Int
        let url: URL
        let pageAnchorsJSON: String
    }

    private let handler: EpubSchemeHandler
    private var cache: [Int: EpubTokens] = [:]
    /// Chapters whose words never came (no read-ahead for them).
    private var failed: Set<Int> = []
    private var queue: [Chapter] = []
    private var loading: Chapter?
    private var load = 0
    private var web: WKWebView?
    private var timeout: Task<Void, Never>?

    init(handler: EpubSchemeHandler) {
        self.handler = handler
    }

    func tokens(for spine: Int) -> EpubTokens? { cache[spine] }

    /// Read these chapters ahead, in this order; the words of any other
    /// chapter are let go.
    func want(_ chapters: [Chapter]) {
        let wanted = Set(chapters.map(\.spine))
        cache = cache.filter { wanted.contains($0.key) }
        queue = chapters.filter { cache[$0.spine] == nil && !failed.contains($0.spine) && $0 != loading }
        startNext()
    }

    /// The hidden view lives in the page's own window (1 pt, out of sight
    /// and out of VoiceOver's way), where WebKit loads it like the page.
    func host(in view: UIView) {
        let web = webView()
        if web.superview !== view { view.addSubview(web) }
    }

    /// The page went away: nothing more is loaded (what's read stays).
    func close() {
        timeout?.cancel()
        queue = []
        loading = nil
        web?.stopLoading()
        web?.configuration.userContentController.removeAllScriptMessageHandlers()
        web?.removeFromSuperview()
        web = nil
    }

    private func webView() -> WKWebView {
        if let web { return web }
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(handler, forURLScheme: EpubRuntime.scheme)
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.dataDetectorTypes = []
        config.mediaTypesRequiringUserActionForPlayback = .all
        config.userContentController.add(WeakScriptMessageHandler(self), contentWorld: .defaultClient, name: "np")
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        web.navigationDelegate = self
        web.isUserInteractionEnabled = false
        web.alpha = 0.01
        web.isAccessibilityElement = false
        web.accessibilityElementsHidden = true
        self.web = web
        return web
    }

    private func startNext() {
        guard loading == nil, !queue.isEmpty else { return }
        let chapter = queue.removeFirst()
        loading = chapter
        load += 1
        let web = webView()
        let controller = web.configuration.userContentController
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(source: EpubRuntime.script(pageAnchorsJSON: chapter.pageAnchorsJSON, load: load),
                                              injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .defaultClient))
        web.load(URLRequest(url: chapter.url))
        timeout?.cancel()
        let current = load
        timeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(20))
            guard let self, !Task.isCancelled, self.load == current, let stuck = self.loading else { return }
            self.failed.insert(stuck.spine)
            self.loading = nil
            self.startNext()
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let chapter = loading, let body = message.body as? [String: Any], body["type"] as? String == "tokens",
              EpubBridge.isCurrent(body, load: load), let tokens = EpubTokens(message: body) else { return }
        cache[chapter.spine] = tokens
        loading = nil
        timeout?.cancel()
        startNext()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        decisionHandler(EpubBridge.allows(navigationAction, loaded: loading?.url) ? .allow : .cancel)
    }
}

/// Holds a message handler weakly (the content controller would otherwise
/// keep its owner, and with it the web view, alive).
@MainActor
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: (any WKScriptMessageHandler)?

    init(_ target: any WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
