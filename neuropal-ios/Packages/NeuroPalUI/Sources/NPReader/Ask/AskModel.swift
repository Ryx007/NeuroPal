import Foundation
import NPCore
import Observation
import SwiftUI

/// A conversation with one document: its history, sending, plain-words
/// problems with a retry. The thread continues the most recent one.
@MainActor
@Observable
final class AskModel {
    struct Item: Identifiable, Equatable {
        enum Kind: Equatable {
            case question
            case answer
            /// The question wasn't answered; the message says why.
            case problem(String)
        }

        let id: String
        var kind: Kind
        var text: String
        var citations: [Citation]
        /// For a problem: the question to try again.
        var question: String?
    }

    let documentID: String
    private(set) var items: [Item] = []
    var input = ""
    private(set) var sending = false
    private(set) var loaded = false
    private(set) var document: NPDocument?
    private(set) var loadProblem: String?
    @ObservationIgnored private var threadID: String?

    init(documentID: String) {
        self.documentID = documentID
    }

    /// Ask works once ingest has finished (the answers come from the index).
    var canAsk: Bool { document?.isReady ?? true }

    func load(api: any NeuroPalAPI) async {
        guard !loaded else { return }
        document = try? await api.document(id: documentID)
        do {
            let history = try await api.chat(documentID: documentID, threadID: nil)
            items = history.compactMap(Self.item)
            threadID = history.last(where: { $0.threadId != nil })?.threadId
            loadProblem = nil
        } catch is CancellationError {
            return
        } catch {
            loadProblem = ReaderCopy.problem(error)
        }
        loaded = true
    }

    private static func item(_ m: ChatMessage) -> Item? {
        if m.role == .user { return Item(id: m.id, kind: .question, text: m.content, citations: []) }
        if m.role == .assistant { return Item(id: m.id, kind: .answer, text: m.content, citations: m.citations) }
        return nil
    }

    func send(_ raw: String, api: any NeuroPalAPI) async {
        let question = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !sending else { return }
        items.append(Item(id: UUID().uuidString, kind: .question, text: question, citations: []))
        sending = true
        defer { sending = false }
        do {
            let answer = try await api.ask(documentID: documentID, question: question, threadID: threadID)
            threadID = answer.threadId ?? threadID
            items.append(Item(id: UUID().uuidString, kind: .answer, text: answer.answer, citations: answer.citations))
            AccessibilityNotification.Announcement("Answer ready").post()
        } catch {
            let message = ReaderCopy.problem(error)
            items.append(Item(id: UUID().uuidString, kind: .problem(message), text: "", citations: [], question: question))
            AccessibilityNotification.Announcement("The question wasn't answered. \(message)").post()
        }
    }

    /// Try a failed question again (its question bubble and the problem go away first).
    func retry(_ problem: Item, api: any NeuroPalAPI) async {
        guard let question = problem.question, let index = items.firstIndex(of: problem) else { return }
        items.remove(at: index)
        if index > 0, items[index - 1].kind == .question, items[index - 1].text == question { items.remove(at: index - 1) }
        await send(question, api: api)
    }
}

/// Answers are untrusted server text: inline Markdown only (bold, italic,
/// code), links made inert, headings and bullets turned into plain lines,
/// `$…$` maths shown as Unicode.
enum AskText {
    static func attributed(_ raw: String) -> AttributedString {
        var lines: [String] = []
        for line in raw.components(separatedBy: "\n") {
            var l = line
            if let r = l.range(of: "^#{1,6}\\s+", options: .regularExpression) {
                let rest = l[r.upperBound...].trimmingCharacters(in: .whitespaces)
                l = rest.isEmpty ? "" : "**\(rest)**"
            } else if let r = l.range(of: "^\\s*[-*+]\\s+", options: .regularExpression) {
                l = "• " + l[r.upperBound...]
            }
            lines.append(l)
        }
        let text = prettifyMath(lines.joined(separator: "\n"))
        var options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        options.failurePolicy = .returnPartiallyParsedIfPossible
        var out = (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
        let linked = out.runs.filter { $0.link != nil }.map(\.range)
        for range in linked { out[range].link = nil }
        return out
    }

    static func plain(_ raw: String) -> String {
        String(attributed(raw).characters)
    }

    /// `$…$` islands → their Unicode rendering.
    static func prettifyMath(_ s: String) -> String {
        guard s.contains("$") else { return s }
        let c = Array(s)
        var out = ""
        var i = 0
        while i < c.count {
            if c[i] == "$", let found = MathText.island(c, from: i) {
                let shown = MathText.display(found.0)
                out += shown.isEmpty ? String(c[i..<found.1]) : shown
                i = found.1
                continue
            }
            out.append(c[i])
            i += 1
        }
        return out
    }

    /// "p. 4 · 4 Limits"
    static func citationLabel(_ c: Citation, index: Int) -> String {
        let parts = [c.page.map { "p. \($0)" }, c.sectionHeading?.trimmingCharacters(in: .whitespaces)]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? "[\(index + 1)] Source" : "[\(index + 1)] " + parts.joined(separator: " · ")
    }

    static func citationSpoken(_ c: Citation, index: Int) -> String {
        var parts = ["Source \(index + 1)"]
        if let page = c.page { parts.append("page \(page)") }
        if let heading = c.sectionHeading, !heading.isEmpty { parts.append(heading) }
        return parts.joined(separator: ", ")
    }
}
