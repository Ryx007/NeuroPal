import NPCore
import NPTheme
import SwiftUI
import UIKit

/// How the reading text looks: PostScript font names, size, spacing, the
/// Dynamic Type category and the page palette.
struct ReaderTextStyle: Equatable {
    var bodyFont: String
    var headingFont: String
    var titleFont: String
    var equationFont: String
    var size: CGFloat
    var lineSpacing: CGFloat
    var sizeCategory: UIContentSizeCategory
    var page: ReaderPage
}

/// A one-shot scroll (resume, chapter, citation, page).
struct ReaderScroll: Equatable {
    enum Anchor: Equatable {
        /// The word at the top of the page.
        case top
        /// The word a third of the way down (where the eye rests while listening).
        case reading
    }

    var id: Int
    var word: Int
    var anchor: Anchor
    var animated: Bool
}

/// A brief glow behind a paragraph (where a citation points).
struct ReaderFlash: Equatable {
    var id: Int
    var block: Int
}

/// Lets SwiftUI controls reach the text view (VoiceOver, find in document).
@MainActor
final class ReaderTextHandle {
    weak var textView: UITextView?

    func focusForVoiceOver() {
        guard let textView else { return }
        UIAccessibility.post(notification: .screenChanged, argument: textView)
    }

    func find() {
        textView?.findInteraction?.presentFindNavigator(showingReplace: false)
    }
}

/// The text reader's page: a non-editable, selectable UITextView. The
/// spoken word is underlined (and filled while the voice reads); the view
/// follows the voice unless the reader scrolls by hand, then waits five
/// seconds before following again. Tapping a word starts reading there;
/// the edit menu offers "Ask about this" and "Read aloud from here".
struct ReaderTextSurface: UIViewRepresentable {
    let text: ReadingText
    let style: ReaderTextStyle
    /// The voice's word, or the reading position when paused.
    let word: Int
    /// Show the position marker at all (hidden before the first listen).
    let showsCursor: Bool
    let playing: Bool
    let follow: Bool
    let animates: Bool
    let bottomInset: CGFloat
    let scroll: ReaderScroll?
    let flash: ReaderFlash?
    /// Bump to re-centre on the voice now.
    let recenter: Int
    let handle: ReaderTextHandle
    var onTapWord: @MainActor (Int) -> Void
    /// After a manual scroll: the first and last visible words.
    var onUserScroll: @MainActor (_ top: Int, _ bottom: Int) -> Void
    var onFollowPaused: @MainActor (Bool) -> Void
    var onAsk: @MainActor (String) -> Void
    var onReadFrom: @MainActor (Int) -> Void
    var onVoiceOverFocus: @MainActor () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> ReaderUITextView {
        let tv = ReaderUITextView(usingTextLayoutManager: true)
        tv.isEditable = false
        tv.isSelectable = true
        tv.isScrollEnabled = true
        tv.alwaysBounceVertical = true
        tv.dataDetectorTypes = []
        tv.textContainer.lineFragmentPadding = 0
        tv.contentInsetAdjustmentBehavior = .automatic
        tv.adjustsFontForContentSizeCategory = false
        tv.isFindInteractionEnabled = true
        tv.keyboardDismissMode = .none
        tv.delegate = context.coordinator
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped(_:)))
        tap.delegate = context.coordinator
        tv.addGestureRecognizer(tap)
        context.coordinator.attach(tv, tap: tap)
        handle.textView = tv
        return tv
    }

    func updateUIView(_ tv: ReaderUITextView, context: Context) {
        context.coordinator.update(self, in: tv)
    }

    static func dismantleUIView(_ tv: ReaderUITextView, coordinator: Coordinator) {
        coordinator.detach()
    }

    @MainActor
    final class Coordinator: NSObject, UITextViewDelegate, UIGestureRecognizerDelegate {
        private var parent: ReaderTextSurface?
        private weak var textView: ReaderUITextView?
        private weak var tap: UITapGestureRecognizer?
        private var textKey: String?
        private var style: ReaderTextStyle?
        private var highlighted: NSRange?
        private var highlightFilled = false
        private var lastScrollID: Int?
        private var lastFlashID: Int?
        private var lastRecenter = 0
        private var lastWord = -1
        private var pendingScroll: ReaderScroll?
        private var pendingFlash: ReaderFlash?
        private var dragging = false
        private var followPausedUntil: Date?
        private var resumeFollow: DispatchWorkItem?
        private weak var flashView: UIView?

        func attach(_ tv: ReaderUITextView, tap: UITapGestureRecognizer) {
            textView = tv
            self.tap = tap
            tv.onLayout = { [weak self, weak tv] in
                guard let self, let tv else { return }
                self.applyPending(tv)
            }
            tv.onWindow = { [weak self, weak tv] in
                guard let self, let tv else { return }
                self.waitForDoubleTaps(tv)
            }
            tv.onVoiceOverFocus = { [weak self] in self?.parent?.onVoiceOverFocus() }
        }

        func detach() {
            resumeFollow?.cancel()
            parent = nil
        }

        // MARK: Updates from SwiftUI

        func update(_ p: ReaderTextSurface, in tv: ReaderUITextView) {
            parent = p
            let key = "\(p.text.documentID)#\(p.text.string.length)#\(p.text.words.count)"
            if key != textKey || p.style != style {
                let keep = textKey == nil ? nil : visibleWords(tv).top
                let restyle = textKey == key
                textKey = key
                style = p.style
                tv.backgroundColor = p.style.page.uiBackground
                tv.tintColor = p.style.page.uiUnderline
                tv.indicatorStyle = p.style.page.dark ? .white : .black
                tv.attributedText = Self.attributed(p.text, style: p.style)
                tv.measure = Self.measure(for: p.style)
                highlighted = nil
                if restyle, let keep, pendingScroll == nil {
                    pendingScroll = ReaderScroll(id: -1, word: keep, anchor: .top, animated: false)
                }
            }
            if abs(tv.contentInset.bottom - p.bottomInset) > 0.5 {
                tv.contentInset.bottom = p.bottomInset
                tv.verticalScrollIndicatorInsets.bottom = p.bottomInset
            }
            applyHighlight(p, in: tv)
            if let s = p.scroll, s.id != lastScrollID {
                lastScrollID = s.id
                pendingScroll = s
            }
            if let f = p.flash, f.id != lastFlashID {
                lastFlashID = f.id
                pendingFlash = f
            }
            if p.recenter != lastRecenter {
                lastRecenter = p.recenter
                followPausedUntil = nil
                resumeFollow?.cancel()
                follow(tv, force: true)
            }
            applyPending(tv)
            if p.playing, p.follow, p.word != lastWord { follow(tv, force: false) }
            lastWord = p.word
        }

        // MARK: Attributed text

        static func font(_ name: String, size: CGFloat, style: UIFont.TextStyle, _ traits: UITraitCollection) -> UIFont {
            let base = UIFont(name: name, size: size) ?? UIFont.preferredFont(forTextStyle: style).withSize(size)
            return UIFontMetrics(forTextStyle: style).scaledFont(for: base, compatibleWith: traits)
        }

        static func measure(for style: ReaderTextStyle) -> CGFloat {
            let traits = UITraitCollection(preferredContentSizeCategory: style.sizeCategory)
            let body = font(style.bodyFont, size: style.size, style: .body, traits)
            return ceil(body.pointSize * 35) // ≈ 70 characters per line
        }

        static func attributed(_ text: ReadingText, style: ReaderTextStyle) -> NSAttributedString {
            let traits = UITraitCollection(preferredContentSizeCategory: style.sizeCategory)
            let body = font(style.bodyFont, size: style.size, style: .body, traits)
            let heading = font(style.headingFont, size: style.size * 1.22, style: .title3, traits)
            let title = font(style.titleFont, size: style.size * 1.5, style: .title1, traits)
            let equation = font(style.equationFont, size: style.size, style: .body, traits)

            let bodyParagraph = NSMutableParagraphStyle()
            bodyParagraph.lineSpacing = style.lineSpacing
            bodyParagraph.paragraphSpacing = round(body.pointSize * 0.85)
            bodyParagraph.lineBreakMode = .byWordWrapping

            let headingParagraph = NSMutableParagraphStyle()
            headingParagraph.lineSpacing = max(2, style.lineSpacing * 0.5)
            headingParagraph.paragraphSpacingBefore = round(body.pointSize * 0.9)
            headingParagraph.paragraphSpacing = round(body.pointSize * 0.5)

            let titleParagraph = NSMutableParagraphStyle()
            titleParagraph.lineSpacing = max(2, style.lineSpacing * 0.5)
            titleParagraph.paragraphSpacing = round(body.pointSize * 1.1)

            let equationParagraph = NSMutableParagraphStyle()
            equationParagraph.alignment = .center
            equationParagraph.lineSpacing = style.lineSpacing
            equationParagraph.paragraphSpacing = round(body.pointSize * 0.85)

            let length = text.string.length
            let out = NSMutableAttributedString(string: text.string as String, attributes: [
                .font: body, .foregroundColor: style.page.uiText, .paragraphStyle: bodyParagraph,
            ])
            out.beginEditing()
            for block in text.blocks where block.kind != .paragraph {
                // Include the separating newline so the paragraph style covers the whole paragraph.
                var range = block.range
                if NSMaxRange(range) < length { range.length += 1 }
                switch block.kind {
                case .title:
                    out.addAttributes([.font: title, .paragraphStyle: titleParagraph], range: range)
                case .heading:
                    out.addAttributes([.font: heading, .paragraphStyle: headingParagraph], range: range)
                case .equation:
                    out.addAttributes([.font: equation, .paragraphStyle: equationParagraph,
                                       .foregroundColor: style.page.uiMath], range: range)
                case .paragraph:
                    break
                }
            }
            for word in text.words where word.isMath && text.blocks[word.block].kind == .paragraph {
                out.addAttributes([.foregroundColor: style.page.uiMath, .obliqueness: 0.12], range: word.range)
            }
            out.endEditing()
            return out
        }

        // MARK: The spoken word

        private func applyHighlight(_ p: ReaderTextSurface, in tv: UITextView) {
            guard !p.text.words.isEmpty, let style else { return }
            let range: NSRange? = p.showsCursor ? p.text.words[p.text.clamp(p.word)].range : nil
            let filled = p.playing
            if range == highlighted, filled == highlightFilled { return }
            let storage = tv.textStorage
            storage.beginEditing()
            if let old = highlighted, NSMaxRange(old) <= storage.length {
                storage.removeAttribute(.backgroundColor, range: old)
                storage.removeAttribute(.underlineStyle, range: old)
                storage.removeAttribute(.underlineColor, range: old)
            }
            if let range, NSMaxRange(range) <= storage.length {
                var attributes: [NSAttributedString.Key: Any] = [
                    .underlineStyle: NSUnderlineStyle.thick.rawValue, .underlineColor: style.page.uiUnderline,
                ]
                if filled { attributes[.backgroundColor] = style.page.uiHighlight }
                storage.addAttributes(attributes, range: range)
            }
            storage.endEditing()
            highlighted = range
            highlightFilled = filled
        }

        // MARK: Scrolling

        private func rect(forRange r: NSRange, in tv: UITextView) -> CGRect? {
            guard let start = tv.position(from: tv.beginningOfDocument, offset: r.location),
                  let end = tv.position(from: start, offset: r.length),
                  let range = tv.textRange(from: start, to: end) else { return nil }
            let rect = tv.firstRect(for: range)
            return rect.isNull || rect.isInfinite || rect.isEmpty && rect.origin == .zero ? nil : rect
        }

        private func rect(forWord w: Int, in tv: UITextView) -> CGRect? {
            guard let p = parent, !p.text.words.isEmpty else { return nil }
            return rect(forRange: p.text.words[p.text.clamp(w)].range, in: tv)
        }

        /// Lays the text out up to an offset, so a far jump lands exactly.
        private func ensureLayout(upTo offset: Int, in tv: UITextView) {
            guard let manager = tv.textLayoutManager, let content = manager.textContentManager else { return }
            let document = manager.documentRange
            guard let end = content.location(document.location, offsetBy: max(0, offset)),
                  let range = NSTextRange(location: document.location, end: end) else { return }
            manager.ensureLayout(for: range)
        }

        private func scroll(_ tv: UITextView, toContentY y: CGFloat, animated: Bool) {
            let inset = tv.adjustedContentInset
            let minY = -inset.top
            let maxY = max(minY, tv.contentSize.height - tv.bounds.height + inset.bottom)
            let target = min(max(y - inset.top, minY), maxY)
            guard abs(target - tv.contentOffset.y) > 1 else { return }
            tv.setContentOffset(CGPoint(x: tv.contentOffset.x, y: target), animated: animated)
        }

        private func follow(_ tv: UITextView, force: Bool) {
            guard let p = parent else { return }
            if !force, dragging { return }
            if !force, let until = followPausedUntil, Date() < until { return }
            guard let rect = rect(forWord: p.word, in: tv) else { return }
            let inset = tv.adjustedContentInset
            let visibleTop = tv.contentOffset.y + inset.top
            let visible = tv.bounds.height - inset.top - inset.bottom
            guard visible > 80 else { return }
            let position = (rect.midY - visibleTop) / visible
            if force || position < 0.12 || position > 0.72 {
                scroll(tv, toContentY: rect.minY - visible * 0.3, animated: p.animates)
            }
        }

        private func applyPending(_ tv: ReaderUITextView) {
            guard tv.bounds.width > 0, tv.bounds.height > 0, tv.attributedText.length > 0 else { return }
            if let s = pendingScroll, let p = parent, !p.text.words.isEmpty {
                pendingScroll = nil
                let r = p.text.words[p.text.clamp(s.word)].range
                ensureLayout(upTo: NSMaxRange(r), in: tv)
                if let rect = rect(forRange: r, in: tv) {
                    let inset = tv.adjustedContentInset
                    let visible = tv.bounds.height - inset.top - inset.bottom
                    let y = s.anchor == .top ? rect.minY - 16 : rect.minY - visible * 0.3
                    scroll(tv, toContentY: y, animated: s.animated && p.animates)
                }
            }
            if let f = pendingFlash {
                pendingFlash = nil
                showFlash(f, in: tv)
            }
        }

        private func showFlash(_ f: ReaderFlash, in tv: UITextView) {
            guard let p = parent, let style, p.text.blocks.indices.contains(f.block) else { return }
            let r = p.text.blocks[f.block].range
            guard let start = tv.position(from: tv.beginningOfDocument, offset: r.location),
                  let end = tv.position(from: start, offset: r.length),
                  let range = tv.textRange(from: start, to: end) else { return }
            let rects = tv.selectionRects(for: range).map(\.rect).filter { !$0.isEmpty && !$0.isNull }
            guard let first = rects.first else { return }
            let union = rects.dropFirst().reduce(first) { $0.union($1) }
            flashView?.removeFromSuperview()
            let glow = UIView(frame: union.insetBy(dx: -10, dy: -6))
            glow.backgroundColor = style.page.uiFlash
            glow.layer.cornerRadius = 10
            glow.layer.cornerCurve = .continuous
            glow.isUserInteractionEnabled = false
            glow.isAccessibilityElement = false
            tv.insertSubview(glow, at: 0)
            flashView = glow
            let animates = p.animates
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { [weak glow] in
                onMain {
                    guard let glow else { return }
                    if animates {
                        UIView.animate(withDuration: 0.6, animations: { glow.alpha = 0 }, completion: { _ in
                            glow.removeFromSuperview()
                        })
                    } else {
                        glow.removeFromSuperview()
                    }
                }
            }
        }

        // MARK: Manual scrolling pauses following

        func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
            dragging = true
            resumeFollow?.cancel()
            if parent?.playing == true { parent?.onFollowPaused(true) }
        }

        func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
            if !decelerate { userScrollEnded() }
        }

        func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
            userScrollEnded()
        }

        func scrollViewDidScrollToTop(_ scrollView: UIScrollView) {
            userScrollEnded()
        }

        private func userScrollEnded() {
            dragging = false
            guard let tv = textView, let p = parent else { return }
            let visible = visibleWords(tv)
            p.onUserScroll(visible.top, visible.bottom)
            guard p.playing else { return }
            followPausedUntil = Date().addingTimeInterval(5)
            resumeFollow?.cancel()
            let work = DispatchWorkItem { [weak self] in
                onMain {
                    guard let self else { return }
                    self.followPausedUntil = nil
                    self.parent?.onFollowPaused(false)
                    if let tv = self.textView, self.parent?.playing == true { self.follow(tv, force: false) }
                }
            }
            resumeFollow = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: work)
        }

        private func word(at point: CGPoint, in tv: UITextView) -> Int? {
            guard let p = parent, let position = tv.closestPosition(to: point) else { return nil }
            return p.text.word(atUTF16: tv.offset(from: tv.beginningOfDocument, to: position))
        }

        private func visibleWords(_ tv: UITextView) -> (top: Int, bottom: Int) {
            let inset = tv.adjustedContentInset
            let topPoint = CGPoint(x: tv.textContainerInset.left + 2, y: tv.contentOffset.y + inset.top + 6)
            let bottomPoint = CGPoint(x: tv.bounds.width - tv.textContainerInset.right - 2,
                                      y: tv.contentOffset.y + tv.bounds.height - inset.bottom - 6)
            let top = word(at: topPoint, in: tv) ?? 0
            let bottom = word(at: bottomPoint, in: tv) ?? top
            return (top, max(top, bottom))
        }

        // MARK: Taps and the edit menu

        @objc func tapped(_ gesture: UITapGestureRecognizer) {
            guard gesture.state == .ended, let tv = textView, let p = parent else { return }
            // VoiceOver's double-tap lands on the view's centre: never start reading from there.
            guard !UIAccessibility.isVoiceOverRunning, tv.selectedRange.length == 0 else { return }
            let point = gesture.location(in: tv)
            guard let w = word(at: point, in: tv), let rect = rect(forWord: w, in: tv),
                  rect.insetBy(dx: -10, dy: -8).contains(point) else { return }
            p.onTapWord(w)
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            true
        }

        /// Our single tap waits for the text view's own double taps (word
        /// selection), so selecting never starts the voice.
        private func waitForDoubleTaps(_ tv: UITextView) {
            guard let tap else { return }
            for case let other as UITapGestureRecognizer in tv.gestureRecognizers ?? []
                where other !== tap && other.numberOfTapsRequired >= 2 {
                tap.require(toFail: other)
            }
        }

        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange,
                      suggestedActions: [UIMenuElement]) -> UIMenu? {
            guard range.length > 0, let p = parent, NSMaxRange(range) <= textView.textStorage.length else { return nil }
            let selected = textView.textStorage.attributedSubstring(from: range).string
            let first = p.text.word(atUTF16: range.location) ?? 0
            let ask = UIAction(title: "Ask about this", image: UIImage(systemName: "sparkles")) { [weak self] _ in
                self?.parent?.onAsk(selected)
            }
            let read = UIAction(title: "Read aloud from here", image: UIImage(systemName: "play")) { [weak self] _ in
                self?.parent?.onReadFrom(first)
            }
            return UIMenu(children: [ask, read] + suggestedActions)
        }
    }
}

/// UITextView that keeps a readable measure (~70 characters) by insetting
/// its text container on wide screens, and reports layout, window and
/// VoiceOver focus.
final class ReaderUITextView: UITextView {
    var onLayout: (@MainActor () -> Void)?
    var onWindow: (@MainActor () -> Void)?
    var onVoiceOverFocus: (@MainActor () -> Void)?
    var measure: CGFloat = 640 {
        didSet { if measure != oldValue { setNeedsLayout() } }
    }
    private var laidOutFor: CGSize = .zero

    override func layoutSubviews() {
        let key = CGSize(width: bounds.width, height: measure)
        if key != laidOutFor, bounds.width > 0 {
            laidOutFor = key
            let side = max(20, floor((bounds.width - measure) / 2))
            let insets = UIEdgeInsets(top: 20, left: side, bottom: 36, right: side)
            if textContainerInset != insets { textContainerInset = insets }
        }
        super.layoutSubviews()
        onLayout?()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { onWindow?() }
    }

    override func accessibilityElementDidBecomeFocused() {
        super.accessibilityElementDidBecomeFocused()
        onVoiceOverFocus?()
    }
}
