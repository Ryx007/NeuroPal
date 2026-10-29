import Foundation

// Documents: /api/documents/* (docs/BRAIN.md §4).
// SKELETON — owned by the Core agent; every method still throws.
extension HTTPNeuroPalAPI {
    public func documents(query: String?) async throws -> [NPDocument] { throw APIError.server(status: 501, message: "not built yet") }
    public func document(id: String) async throws -> NPDocument { throw APIError.server(status: 501, message: "not built yet") }
    public func upload(fileURL: URL, title: String?) async throws -> NPDocument { throw APIError.server(status: 501, message: "not built yet") }
    public func renameDocument(id: String, title: String, subtitle: String?) async throws -> NPDocument {
        throw APIError.server(status: 501, message: "not built yet")
    }
    public func deleteDocument(id: String) async throws { throw APIError.server(status: 501, message: "not built yet") }
    public func documentText(id: String) async throws -> DocumentText { throw APIError.server(status: 501, message: "not built yet") }
    public func readingProgress(id: String) async throws -> ReadingProgress { throw APIError.server(status: 501, message: "not built yet") }
    public func saveReadingProgress(id: String, _ update: ReadingProgressUpdate) async throws {
        throw APIError.server(status: 501, message: "not built yet")
    }
    public func ask(documentID: String, question: String, threadID: String?) async throws -> QueryAnswer {
        throw APIError.server(status: 501, message: "not built yet")
    }
    public func chat(documentID: String, threadID: String?) async throws -> [ChatMessage] { throw APIError.server(status: 501, message: "not built yet") }
    public func ticket(documentID: String) async throws -> DocTicket { throw APIError.server(status: 501, message: "not built yet") }
    public func epubManifest(documentID: String) async throws -> EpubManifest { throw APIError.server(status: 501, message: "not built yet") }

    public func pageImageURL(documentID: String, page: Int, ticket: String?) -> URL {
        url("/documents/\(Self.segment(documentID))/page/\(page)", query: ticket.map { [URLQueryItem(name: "t", value: $0)] } ?? [])
    }

    public func epubBaseURL(documentID: String, ticket: String?) -> URL {
        let id = Self.segment(documentID)
        if let ticket { return url("/documents/\(id)/epub/t/\(Self.segment(ticket))/") }
        return url("/documents/\(id)/epub/")
    }
}
