import Foundation
@testable import NPCore
import Testing

@Suite("EPUB chapter sanitizer")
struct EpubSanitizerTests {
    @Test func scriptsGoWithTheirContent() {
        #expect(EpubSanitizer.sanitize("<p>a</p><script>alert(1)</script><p>b</p>") == "<p>a</p><p>b</p>")
        #expect(EpubSanitizer.sanitize("<SCRIPT type=\"text/javascript\">x()</SCRIPT >") == "")
        #expect(EpubSanitizer.sanitize("<script src=\"x.js\"/>") == "")
        #expect(EpubSanitizer.sanitize("<svg><script>x()</script></svg>") == "<svg></svg>")
    }

    @Test func scriptsRebuiltByARemovalGoToo() {
        #expect(EpubSanitizer.sanitize("<scr<script>x</script>ipt>alert(1)</script>") == "")
        #expect(EpubSanitizer.sanitize("<scr<scr<script></script>ipt></script>ipt>alert(2)</script>ok") == "ok")
        let out = EpubSanitizer.sanitize("<me<script></script>ta http-equiv=\"refresh\" content=\"0;url=x\">ok")
        #expect(out == "ok")
    }

    @Test func aTagEndsWhereTheBrowserEndsIt() {
        // `<` inside the tag doesn't end it for the browser, so it mustn't for us.
        #expect(EpubSanitizer.sanitize("<meta http-equiv=\"refresh\" content=\"0;url=npbook://book/x.xhtml\" <x>ok") == "ok")
        #expect(EpubSanitizer.sanitize("<script <x>alert(1)</script>ok") == "ok")
        // A `>` inside a quoted value doesn't end it either.
        #expect(EpubSanitizer.sanitize("<meta content=\"a>b\" http-equiv=refresh>ok") == "ok")
        // A quote opens a value only after `=`.
        #expect(EpubSanitizer.sanitize("<meta a\"b http-equiv=refresh content=1>ok") == "ok")
    }

    @Test func everyMetaAndBaseTagGoes() {
        #expect(EpubSanitizer.sanitize("<META HTTP-EQUIV=refresh CONTENT=\"0; url=x\">t") == "t")
        #expect(EpubSanitizer.sanitize("<meta charset=\"utf-8\"/><title>T</title>") == "<title>T</title>")
        #expect(EpubSanitizer.sanitize("<base href=\"https://example.com/\">t") == "t")
        #expect(EpubSanitizer.sanitize("<meta/http-equiv=refresh content=0>t") == "t")
        // Other tags that only start the same way stay.
        #expect(EpubSanitizer.sanitize("<metadata>m</metadata><basefont size=3>") == "<metadata>m</metadata><basefont size=3>")
    }

    @Test func handlersAndScriptAddressesGo() {
        let img = EpubSanitizer.sanitize("<img src=\"a.png\" onerror=\"alert(1)\" alt=\"A\">")
        #expect(!img.lowercased().contains("onerror"))
        #expect(img.contains("src=\"a.png\"") && img.contains("alt=\"A\""))
        #expect(!EpubSanitizer.sanitize("<img src=\"a.png\"onload='x()'>").lowercased().contains("onload"))
        #expect(!EpubSanitizer.sanitize("<body/onload=x()>").lowercased().contains("onload"))
        #expect(EpubSanitizer.sanitize("<a href=\"javascript:alert('x')\">t</a>") == "<a href=\"#\">t</a>")
        #expect(EpubSanitizer.sanitize("<a href='javascript:void(0)'>t</a>") == "<a href='#'>t</a>")
        #expect(EpubSanitizer.sanitize("<a href=javascript:alert(1)>t</a>") == "<a href=\"#\">t</a>")
        #expect(EpubSanitizer.sanitize("<svg><a xlink:href=\"javascript:x()\">t</a></svg>") == "<svg><a xlink:href=\"#\">t</a></svg>")
    }

    @Test func theTextStaysAsItIs() {
        let text = "<p class=\"x\">If a &lt; b, onload = 3 and javascript: is a word, x < y.</p>"
        #expect(EpubSanitizer.sanitize(text) == text)
        let math = "<p>Let <span class=\"math\">x<sup>2</sup></span> be the onset=1 value.</p>"
        #expect(EpubSanitizer.sanitize(math) == math)
    }

    @Test func thePrologGoes() {
        let out = EpubSanitizer.sanitize("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE html>\n<html><body>t</body></html>")
        #expect(out == "\n<html><body>t</body></html>")
    }

    @Test(.timeLimit(.minutes(1)))
    func hostileMarkupDoesNotStall() {
        // Unclosed tags full of quotes and `=`: the patterns never backtrack.
        let quotes = String(repeating: "<meta =\" =' ", count: 2000)
        _ = EpubSanitizer.sanitize(quotes)
        let scripts = String(repeating: "<script>", count: 2000)
        #expect(EpubSanitizer.sanitize(scripts) == "")
        let tags = String(repeating: "<a b=\"c\" ", count: 2000)
        _ = EpubSanitizer.sanitize(tags)
    }
}
