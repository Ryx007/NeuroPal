import PDFKit
import SwiftUI
import UIKit

/// The original PDF in PDFKit: crisp pages, pinch to zoom, VoiceOver reads
/// its text. The page in view and the reader's page stay in step.
struct OriginalPDFView: UIViewRepresentable {
    let url: URL
    @Binding var page: Int
    let background: UIColor
    let bottomInset: CGFloat

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> ReaderPDFView {
        let view = ReaderPDFView()
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.autoScales = true
        view.pageShadowsEnabled = true
        view.backgroundColor = background
        view.document = PDFDocument(url: url)
        let coordinator = context.coordinator
        coordinator.page = $page
        coordinator.observe(view)
        // A PDFView without a size can't scroll to a page (it lays out at
        // page 1 later), so the reading page is shown after the first layout.
        view.onFirstLayout = { [weak view, weak coordinator] in
            guard let view, let coordinator else { return }
            coordinator.position(view)
        }
        return view
    }

    func updateUIView(_ view: ReaderPDFView, context: Context) {
        let coordinator = context.coordinator
        coordinator.page = $page
        if view.backgroundColor != background { view.backgroundColor = background }
        // PDFView scrolls inside its own scroll view: keep the last page clear of the player.
        if let scroll = view.subviews.compactMap({ $0 as? UIScrollView }).first,
           abs(scroll.contentInset.bottom - bottomInset) > 0.5 {
            scroll.contentInset.bottom = bottomInset
        }
        guard coordinator.positioned, !coordinator.reporting, let doc = view.document, page >= 1, page <= doc.pageCount,
              let current = view.currentPage, doc.index(for: current) + 1 != page,
              let target = doc.page(at: page - 1) else { return }
        view.go(to: target)
        view.alignTop(of: target)
    }

    @MainActor
    final class Coordinator: NSObject {
        var page: Binding<Int>?
        private(set) var reporting = false
        /// Until the first page is shown, PDFKit's own page changes are layout noise.
        private(set) var positioned = false

        func observe(_ view: PDFView) {
            NotificationCenter.default.addObserver(self, selector: #selector(pageChanged(_:)),
                                                   name: .PDFViewPageChanged, object: view)
        }

        func position(_ view: ReaderPDFView) {
            defer { positioned = true }
            guard let doc = view.document, let n = page?.wrappedValue, n > 1, n <= doc.pageCount,
                  let target = doc.page(at: n - 1) else { return }
            view.layoutDocumentView()
            view.go(to: target)
            view.alignTop(of: target)
        }

        @objc private func pageChanged(_ note: Notification) {
            guard positioned, let view = note.object as? PDFView, let doc = view.document,
                  let current = view.currentPage else { return }
            let n = doc.index(for: current) + 1
            guard page?.wrappedValue != n else { return }
            reporting = true
            page?.wrappedValue = n
            reporting = false
        }
    }
}

/// A PDFView that says when it first has a size, and can put a page's top
/// edge at the top of what's visible.
final class ReaderPDFView: PDFView {
    var onFirstLayout: (@MainActor () -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, bounds.height > 0, let action = onFirstLayout else { return }
        onFirstLayout = nil
        // After this layout pass has settled.
        Task { @MainActor in action() }
    }

    /// `go(to:)` can leave the page's top under the bars; measure where it
    /// landed and scroll the rest of the way.
    func alignTop(of page: PDFPage) {
        guard let scroll = subviews.compactMap({ $0 as? UIScrollView }).first else { return }
        let pageTop = convert(page.bounds(for: displayBox), from: page).minY
        let visibleTop = scroll.frame.minY + scroll.adjustedContentInset.top
        let lowest = -scroll.adjustedContentInset.top
        let highest = max(lowest, scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom)
        // A point into the page, so PDFKit counts it as the page in view.
        let offset = scroll.contentOffset.y + (pageTop - visibleTop) + 1
        scroll.setContentOffset(CGPoint(x: scroll.contentOffset.x, y: min(max(offset, lowest), highest)), animated: false)
    }
}
