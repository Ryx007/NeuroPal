import Foundation

// Documents: /api/documents/* (docs/BRAIN.md §4,
// neuropal-backend/src/routes/documents.js and query.js).
extension HTTPNeuroPalAPI {
    /// GET /api/documents[?q=] — newest first; each carries readingProgress.
    public func documents(query: String?) async throws -> [NPDocument] {
        let q = query.nonEmpty.map { [URLQueryItem(name: "q", value: $0)] } ?? []
        return try await json("GET", "/documents", query: q)
    }

    public func document(id: String) async throws -> NPDocument {
        try await json("GET", "/documents/\(Self.segment(id))")
    }

    /// POST /api/documents/upload — multipart/form-data, field `file` (+
    /// `title`), streamed from disk. 201 → the new Document (status pending).
    public func upload(fileURL: URL, title: String?) async throws -> NPDocument {
        let (request, bodyFile) = try uploadRequest(fileURL: fileURL, title: title)
        defer { try? FileManager.default.removeItem(at: bodyFile) }
        let data = try await checked(request, bodyFile: bodyFile)
        return try decode(NPDocument.self, data)
    }

    /// PATCH /api/documents/:id — `subtitle` nil or empty clears it (as the mock does).
    public func renameDocument(id: String, title: String, subtitle: String?) async throws -> NPDocument {
        try await json("PATCH", "/documents/\(Self.segment(id))", body: RenameBody(title: title, subtitle: subtitle ?? ""))
    }

    /// DELETE /api/documents/:id — soft delete (chunks and reading state go too).
    public func deleteDocument(id: String) async throws {
        try await send("DELETE", "/documents/\(Self.segment(id))")
    }

    /// POST /api/documents/:id/reingest → `{ok, status: "pending"}`. A failed
    /// ingest resumes where it stopped; the list shows the stages again.
    public func reingestDocument(id: String) async throws {
        try await send("POST", "/documents/\(Self.segment(id))/reingest", body: EmptyBody())
    }

    /// GET /api/documents/:id/text — the reader and read-aloud source.
    public func documentText(id: String) async throws -> DocumentText {
        try await json("GET", "/documents/\(Self.segment(id))/text", timeout: 60)
    }

    public func readingProgress(id: String) async throws -> ReadingProgress {
        try await json("GET", "/documents/\(Self.segment(id))/progress")
    }

    /// PATCH /api/documents/:id/progress — the reader's heartbeat.
    public func saveReadingProgress(id: String, _ update: ReadingProgressUpdate) async throws {
        try await send("PATCH", "/documents/\(Self.segment(id))/progress", body: update)
    }

    /// POST /api/documents/:id/query — retrieval + the model; can take minutes.
    public func ask(documentID: String, question: String, threadID: String?) async throws -> QueryAnswer {
        try await json("POST", "/documents/\(Self.segment(documentID))/query",
                       body: QueryBody(question: question, threadId: threadID.nonEmpty), timeout: Timeout.model)
    }

    /// GET /api/documents/:id/chat[?threadId=] — oldest first, at most 100.
    public func chat(documentID: String, threadID: String?) async throws -> [ChatMessage] {
        let q = threadID.nonEmpty.map { [URLQueryItem(name: "threadId", value: $0)] } ?? []
        return try await json("GET", "/documents/\(Self.segment(documentID))/chat", query: q)
    }

    /// GET /api/documents/:id/ticket — `{ticket: null}` on a single-user server.
    public func ticket(documentID: String) async throws -> DocTicket {
        try await json("GET", "/documents/\(Self.segment(documentID))/ticket")
    }

    public func epubManifest(documentID: String) async throws -> EpubManifest {
        try await json("GET", "/documents/\(Self.segment(documentID))/epub-manifest", timeout: 60)
    }

    public func pageImageURL(documentID: String, page: Int, ticket: String?) -> URL {
        url("/documents/\(Self.segment(documentID))/page/\(page)", query: ticket.map { [URLQueryItem(name: "t", value: $0)] } ?? [])
    }

    public func epubBaseURL(documentID: String, ticket: String?) -> URL {
        let id = Self.segment(documentID)
        if let ticket { return url("/documents/\(id)/epub/t/\(Self.segment(ticket))/") }
        return url("/documents/\(id)/epub/")
    }

    public func originalFileURL(documentID: String, ticket: String?) -> URL {
        url("/documents/\(Self.segment(documentID))/file", query: ticket.map { [URLQueryItem(name: "t", value: $0)] } ?? [])
    }

    /// GET /api/documents/:id/file, streamed to disk (books can be hundreds
    /// of MB): np-original-<id>.pdf in the temporary folder, replaced on
    /// each download.
    public func downloadOriginalFile(documentID: String) async throws -> URL {
        var r = try request("GET", "/documents/\(Self.segment(documentID))/file", timeout: Timeout.upload)
        r.setValue("application/pdf", forHTTPHeaderField: "Accept")
        let sentAuthorization = r.value(forHTTPHeaderField: "Authorization")
        let (downloaded, http) = try await rawDownload(r)
        defer { try? FileManager.default.removeItem(at: downloaded) }
        guard (200..<300).contains(http.statusCode) else {
            // Only the start of an error body: the server's `{error}` is
            // short, and a page in front of it could be anything.
            throw mapError(status: http.statusCode, data: Self.head(of: downloaded), headers: http,
                           sentAuthorization: sentAuthorization, url: r.url)
        }
        let name = documentID.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) && $0.isASCII }
        let destination = FileManager.default.temporaryDirectory
            .appending(path: "np-original-\(String(String.UnicodeScalarView(name)).prefix(64)).pdf")
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: downloaded, to: destination)
        return destination
    }

    /// The first `limit` bytes of a file (an error reply saved to disk).
    static func head(of file: URL, limit: Int = 64 << 10) -> Data {
        guard let handle = try? FileHandle(forReadingFrom: file) else { return Data() }
        defer { try? handle.close() }
        return (try? handle.read(upToCount: limit)) ?? Data()
    }

    // MARK: Upload body

    /// The upload request plus the temporary file holding its multipart body
    /// (the caller deletes it; if building it fails, nothing is left behind).
    /// The document is copied into the body in chunks, so a 300 MB book
    /// never sits in memory.
    func uploadRequest(fileURL: URL, title: String?,
                       in folder: URL = FileManager.default.temporaryDirectory) throws -> (URLRequest, URL) {
        let boundary = "NeuroPal-\(UUID().uuidString)"
        let bodyFile = folder.appending(path: "np-upload-\(UUID().uuidString).multipart")
        // Always send the title: the server reads a part's filename as
        // Latin-1, so a non-English file name would otherwise arrive garbled.
        // Composed form (file names come decomposed), so a search finds it.
        let name = (title.nonEmpty ?? fileURL.deletingPathExtension().lastPathComponent).precomposedStringWithCanonicalMapping
        do {
            try Multipart.write(file: fileURL, title: name.isEmpty ? nil : name, boundary: boundary, to: bodyFile)
        } catch {
            try? FileManager.default.removeItem(at: bodyFile)
            throw error
        }

        var r: URLRequest
        do {
            r = try request("POST", "/documents/upload", timeout: Timeout.upload)
        } catch {
            try? FileManager.default.removeItem(at: bodyFile)
            throw error
        }
        r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let size = (try? FileManager.default.attributesOfItem(atPath: bodyFile.path))?[.size] as? NSNumber {
            r.setValue(size.stringValue, forHTTPHeaderField: "Content-Length")
        }
        return (r, bodyFile)
    }
}

/// multipart/form-data, written straight to a file.
enum Multipart {
    /// The MIME type the server expects for each format it reads (it decides
    /// by extension first, so octet-stream is a safe fallback).
    static func mimeType(forExtension ext: String) -> String {
        switch ext.lowercased() {
        case "pdf": return "application/pdf"
        case "epub": return "application/epub+zip"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        case "md", "markdown": return "text/markdown"
        case "txt": return "text/plain"
        case "djvu", "djv": return "image/vnd.djvu"
        default: return "application/octet-stream"
        }
    }

    /// A plain-ASCII filename for the quoted header value. The server
    /// renames the file anyway; only the extension matters there (the title
    /// travels in its own field).
    static func headerFilename(_ name: String) -> String {
        let folded = name.folding(options: [.diacriticInsensitive, .widthInsensitive], locale: nil)
        let cleaned = String(String.UnicodeScalarView(folded.unicodeScalars.map { s in
            s.isASCII && s.value >= 0x20 && s != "\"" && s != "\\" && s.value != 0x7F ? s : "_"
        }))
        return cleaned.isEmpty || cleaned.hasPrefix(".") ? "document" + cleaned : cleaned
    }

    static func write(file: URL, title: String?, boundary: String, to destination: URL) throws {
        // A file from the document picker is security-scoped; reading it
        // needs access for as long as the copy runs (a no-op for other files).
        let scoped = file.startAccessingSecurityScopedResource()
        defer { if scoped { file.stopAccessingSecurityScopedResource() } }
        guard FileManager.default.createFile(atPath: destination.path, contents: nil) else {
            throw CocoaError(.fileWriteUnknown)
        }
        let out = try FileHandle(forWritingTo: destination)
        defer { try? out.close() }
        let input = try FileHandle(forReadingFrom: file)
        defer { try? input.close() }

        var head = ""
        if let title {
            head += "--\(boundary)\r\n"
            head += "Content-Disposition: form-data; name=\"title\"\r\n"
            head += "Content-Type: text/plain; charset=utf-8\r\n\r\n"
            head += title.replacingOccurrences(of: "\r", with: " ").replacingOccurrences(of: "\n", with: " ")
            head += "\r\n"
        }
        let filename = headerFilename(file.lastPathComponent)
        head += "--\(boundary)\r\n"
        head += "Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n"
        head += "Content-Type: \(mimeType(forExtension: file.pathExtension))\r\n\r\n"
        try out.write(contentsOf: Data(head.utf8))

        while let chunk = try input.read(upToCount: 1 << 20), !chunk.isEmpty {
            try out.write(contentsOf: chunk)
        }
        try out.write(contentsOf: Data("\r\n--\(boundary)--\r\n".utf8))
    }
}

// MARK: - Wire shapes

struct RenameBody: Encodable {
    let title: String
    let subtitle: String
}

struct QueryBody: Encodable {
    let question: String
    let threadId: String?
}
