import Foundation

/// Strips a book chapter's active content before the reader shows it. This
/// is the second layer: the reader already turns the page's JavaScript off,
/// runs its own script in a content world the book can't reach and puts a
/// strict Content-Security-Policy first (NPReader's EpubRuntime).
///
/// Removed: the XML declaration and doctype; every `<script>` element, with
/// its content, and any opening or closing script tag left over; every
/// `<meta>` and `<base>` tag (the reader brings its own; a meta refresh is
/// the one way markup can navigate the page); event-handler attributes; and
/// `javascript:` addresses. A tag ends where the browser ends it — a `>`
/// outside a quoted value — so `<meta … <x>` can't hide a tag's end. The
/// removal repeats until nothing changes, so pieces that join up after one
/// pass (`<scr<script></script>ipt>`) go too. Text between tags stays as it is.
///
/// Every pattern is compiled once and never backtracks (possessive
/// repeats), so a hostile book can't make one blow up; run it off the main
/// thread all the same, chapters can be megabytes.
public enum EpubSanitizer {
    public static func sanitize(_ source: String) -> String {
        var html = source
        for _ in 0..<maxRounds {
            let next = pass(html)
            if next == html { return html }
            html = next
        }
        // Still changing after this many rounds: made to get past the filter.
        return ""
    }

    static let maxRounds = 32

    // A tag's inside, the way the HTML tokenizer reads it: a quote opens a
    // value only after `=`; anything else but `>` belongs to the tag.
    private static let inside = #"(?:=\s*"[^"]*"|=\s*'[^']*'|[^>])*+"#

    private struct Pattern: @unchecked Sendable {
        let regex: NSRegularExpression
        init(_ pattern: String) {
            // Constant patterns, covered by NPCoreTests: compiling can't fail.
            regex = try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
        }

        func remove(in s: String) -> String {
            regex.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: "")
        }

        func replace(in s: String, template: String) -> String {
            regex.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: template)
        }

        func transform(in s: String, _ body: (String) -> String) -> String {
            let ns = s as NSString
            var out = ""
            var last = 0
            for match in regex.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
                out += ns.substring(with: NSRange(location: last, length: match.range.location - last))
                out += body(ns.substring(with: match.range))
                last = NSMaxRange(match.range)
            }
            out += ns.substring(from: last)
            return out
        }
    }

    private static let xmlDeclaration = Pattern(#"^\s*+<\?xml[^>]*+>"#)
    private static let doctype = Pattern(#"^\s*+<!doctype[^>]*+>"#)
    private static let scriptElement = Pattern(#"<script\b"# + inside + #">[\s\S]*?</script\b[^>]*+>"#)
    private static let scriptTag = Pattern(#"</?script\b"# + inside + #">"#)
    private static let metaOrBase = Pattern(#"<(?:meta|base)\b"# + inside + #">"#)
    private static let tag = Pattern(#"<[a-z]"# + inside + #">"#)
    private static let handler = Pattern(#"(?<=[\s/"'])on[a-z]++\s*+=\s*+(?:"[^"]*+"|'[^']*+'|[^\s>"']++)"#)
    private static let urlAttribute = #"((?:xlink:)?href|src|action|formaction|poster|data)\s*+=\s*+"#
    private static let doubleQuotedScriptURL = Pattern(urlAttribute + #""\s*+javascript:[^"]*+""#)
    private static let singleQuotedScriptURL = Pattern(urlAttribute + #"'\s*+javascript:[^']*+'"#)
    private static let bareScriptURL = Pattern(urlAttribute + #"javascript:[^\s>]*+"#)

    private static func pass(_ source: String) -> String {
        var html = xmlDeclaration.remove(in: source)
        html = doctype.remove(in: html)
        // Whole script elements first, round after round until none is
        // left (so a script rebuilt by a removal goes with its content);
        // only then the stray script tags.
        let withoutScripts = scriptElement.remove(in: html)
        if withoutScripts != html { return withoutScripts }
        html = scriptTag.remove(in: html)
        html = metaOrBase.remove(in: html)
        // Attributes only inside tags: the chapter's text stays untouched.
        return tag.transform(in: html) { t in
            var t = handler.replace(in: t, template: " ")
            t = doubleQuotedScriptURL.replace(in: t, template: "$1=\"#\"")
            t = singleQuotedScriptURL.replace(in: t, template: "$1='#'")
            return bareScriptURL.replace(in: t, template: "$1=\"#\"")
        }
    }
}
