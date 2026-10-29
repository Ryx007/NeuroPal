import Foundation
import NPCore

/// The reader's wording: plain, calm, short — no exclamation marks.
enum ReaderCopy {
    /// Why a request failed, in plain words.
    static func problem(_ error: Error) -> String {
        guard let api = error as? APIError else { return "Something went wrong. Try again in a moment." }
        switch api {
        case .offline:
            return "You're offline right now. Try again when you're connected."
        case .rateLimited(let seconds):
            if let seconds { return "That's a lot in a short time. You can try again in \(seconds) seconds." }
            return "That's a lot in a short time. Try again in a minute."
        case .unauthorized:
            return "Your session has ended. Sign in again to continue."
        case .notFound:
            return "This document isn't in your library any more."
        case .server(let status, let message):
            if status == 413 { return "This file is too big to upload." }
            if status >= 500 { return "The server is busy right now. Try again in a moment." }
            return message.isEmpty ? "The server couldn't do that just now." : message
        default:
            return api.errorDescription ?? "Something went wrong. Try again in a moment."
        }
    }

    /// Listening time for a number of words at a speed: "<1 min", "4 min", "1 h 20 min".
    static func listeningTime(words: Int, wpm: Double) -> String {
        let minutes = Double(max(0, words)) / max(60, wpm)
        if minutes < 1 { return "<1 min" }
        if minutes < 60 { return "\(Int(minutes.rounded())) min" }
        let h = Int(minutes / 60)
        let m = Int(minutes.truncatingRemainder(dividingBy: 60).rounded())
        return m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }

    /// The same, for VoiceOver ("about 4 minutes").
    static func listeningTimeSpoken(words: Int, wpm: Double) -> String {
        let minutes = Double(max(0, words)) / max(60, wpm)
        if minutes < 1 { return "less than a minute" }
        if minutes < 60 {
            let m = Int(minutes.rounded())
            return m == 1 ? "about 1 minute" : "about \(m) minutes"
        }
        let h = Int(minutes / 60)
        let m = Int(minutes.truncatingRemainder(dividingBy: 60).rounded())
        let hours = h == 1 ? "1 hour" : "\(h) hours"
        return m == 0 ? "about \(hours)" : "about \(hours) \(m) minutes"
    }

    static func percent(_ value: Double) -> Int { Int((min(1, max(0, value)) * 100).rounded()) }
}

extension DocumentType {
    /// Badge text.
    var label: String {
        switch rawValue {
        case "pdf": return "PDF"
        case "epub": return "EPUB"
        case "docx": return "Word"
        case "pptx": return "Slides"
        case "md": return "Notes"
        case "txt": return "Text"
        case "djvu": return "DjVu"
        case "arxiv": return "arXiv"
        case "web": return "Web"
        default: return "File"
        }
    }

    /// What VoiceOver says for the type.
    var spokenName: String {
        switch rawValue {
        case "pdf": return "PDF"
        case "epub": return "EPUB book"
        case "docx": return "Word document"
        case "pptx": return "slides"
        case "md": return "Markdown notes"
        case "txt": return "text file"
        case "djvu": return "DjVu scan"
        case "arxiv": return "arXiv paper"
        case "web": return "web page"
        default: return "file"
        }
    }

    /// SF Symbol for the badge.
    var symbol: String {
        switch rawValue {
        case "pdf": return "doc.richtext"
        case "epub": return "book.closed"
        case "docx": return "doc.text"
        case "pptx": return "rectangle.on.rectangle"
        case "md": return "note.text"
        case "txt": return "doc.plaintext"
        case "djvu": return "book.pages"
        case "arxiv": return "atom"
        case "web": return "globe"
        default: return "doc"
        }
    }

    /// Rendered page images exist for these (GET /page/:n).
    var hasPageImages: Bool { rawValue == "pdf" || rawValue == "arxiv" }
}

extension DocumentStatus {
    /// The ingest stage in plain words.
    var stageText: String {
        switch rawValue {
        case "pending": return "Waiting to start"
        case "parsing": return "Reading the file"
        case "chunking": return "Splitting into passages"
        case "embedding": return "Indexing for Ask"
        case "ready": return "Ready"
        case "failed": return "Couldn't be read"
        default: return "Processing"
        }
    }

    /// 1-based step of the four processing stages (nil when not processing).
    var step: Int? {
        switch rawValue {
        case "pending": return 1
        case "parsing": return 2
        case "chunking": return 3
        case "embedding": return 4
        default: return nil
        }
    }
}

extension NPDocument {
    /// Reading progress 0…1 (0 when never opened).
    var readFraction: Double { min(1, max(0, readingProgress ?? 0)) }

    var isReady: Bool { status == .ready || status == .unknown }

    /// The ingest error in plain words.
    var failureText: String {
        let reason = (ingestError ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return reason.isEmpty ? "This file couldn't be read." : reason
    }
}
