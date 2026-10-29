import Foundation
import NPCore
import Observation
import UniformTypeIdentifiers

/// Library filters (the Expo app's chips).
enum LibraryFilter: String, CaseIterable, Identifiable {
    case all, inProgress, unread, pdf, epub, arxiv, other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "All"
        case .inProgress: return "In progress"
        case .unread: return "Unread"
        case .pdf: return "PDF"
        case .epub: return "EPUB"
        case .arxiv: return "arXiv"
        case .other: return "Other"
        }
    }

    func matches(_ d: NPDocument) -> Bool {
        switch self {
        case .all: return true
        case .inProgress: return d.readFraction > 0 && d.readFraction < 1
        case .unread: return d.readFraction == 0
        case .pdf: return d.type == .pdf
        case .epub: return d.type == .epub
        case .arxiv: return d.type == .arxiv
        case .other: return ![.pdf, .epub, .arxiv].contains(d.type)
        }
    }
}

/// A file on its way into the library.
struct UploadJob: Identifiable, Equatable {
    enum State: Equatable {
        case preparing
        case uploading
        case failed(String)
    }

    let id = UUID()
    let name: String
    /// The picked file (security-scoped) or an already staged copy.
    let source: URL
    var staged: URL?
    var state: State = .preparing
}

/// The document list: server search, polling while anything is being
/// processed, uploads, rename and delete.
@MainActor
@Observable
final class LibraryModel {
    private(set) var documents: [NPDocument] = []
    var query = ""
    var filter: LibraryFilter = .all
    private(set) var loaded = false
    private(set) var problem: String?
    private(set) var uploads: [UploadJob] = []
    /// A transient message (delete/rename trouble).
    var notice: String?
    @ObservationIgnored private var request = 0

    /// Recently read first, then newest.
    var visible: [NPDocument] {
        documents.filter(filter.matches).sorted { a, b in
            switch (a.lastReadAt, b.lastReadAt) {
            case let (x?, y?): return x > y
            case (.some, nil): return true
            case (nil, .some): return false
            case (nil, nil): return (a.createdAt ?? .distantPast) > (b.createdAt ?? .distantPast)
            }
        }
    }

    var hasProcessing: Bool { documents.contains { $0.status.isProcessing } }
    var isFiltered: Bool { filter != .all || !query.trimmingCharacters(in: .whitespaces).isEmpty }

    func refresh(_ api: any NeuroPalAPI) async {
        request += 1
        let id = request
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let docs = try await api.documents(query: q.isEmpty ? nil : q)
            guard id == request else { return }
            documents = docs
            problem = nil
            loaded = true
        } catch is CancellationError {
        } catch {
            guard id == request else { return }
            problem = ReaderCopy.problem(error)
            loaded = true
        }
    }

    // MARK: Uploads

    static let kinds = ["pdf", "epub", "docx", "pptx", "md", "markdown", "txt", "djvu"]

    static var contentTypes: [UTType] {
        var types: [UTType] = [.pdf, .epub, .plainText]
        for id in ["org.openxmlformats.wordprocessingml.document", "org.openxmlformats.presentationml.presentation",
                   "net.daringfireball.markdown"] {
            if let t = UTType(id) { types.append(t) }
        }
        for ext in ["docx", "pptx", "md", "djvu"] {
            if let t = UTType(filenameExtension: ext), !types.contains(t) { types.append(t) }
        }
        return types
    }

    func upload(_ urls: [URL], staged: Bool, api: any NeuroPalAPI) {
        for url in urls {
            var job = UploadJob(name: url.lastPathComponent, source: url, staged: staged ? url : nil)
            guard Self.kinds.contains(url.pathExtension.lowercased()) else {
                job.state = .failed("NeuroPal can't read .\(url.pathExtension.lowercased()) files yet. PDF, EPUB, Word, PowerPoint, Markdown, text and DjVu all work.")
                uploads.append(job)
                continue
            }
            uploads.append(job)
            let id = job.id
            Task { await run(id, api: api) }
        }
    }

    func retry(_ job: UploadJob, api: any NeuroPalAPI) {
        guard let i = uploads.firstIndex(where: { $0.id == job.id }) else { return }
        uploads[i].state = .preparing
        Task { await run(job.id, api: api) }
    }

    func dismiss(_ job: UploadJob) {
        uploads.removeAll { $0.id == job.id }
        if let staged = job.staged { UploadStaging.discard(staged) }
    }

    private func set(_ id: UUID, _ change: (inout UploadJob) -> Void) {
        guard let i = uploads.firstIndex(where: { $0.id == id }) else { return }
        change(&uploads[i])
    }

    private func run(_ id: UUID, api: any NeuroPalAPI) async {
        guard let job = uploads.first(where: { $0.id == id }) else { return }
        do {
            var file = job.staged
            if file == nil {
                let source = job.source
                file = try await Task.detached(priority: .userInitiated) { try UploadStaging.stage(source) }.value
                set(id) { $0.staged = file }
            }
            guard let file else { return }
            set(id) { $0.state = .uploading }
            let doc = try await api.upload(fileURL: file, title: nil)
            uploads.removeAll { $0.id == id }
            UploadStaging.discard(file)
            documents.removeAll { $0.id == doc.id }
            documents.insert(doc, at: 0)
            await refresh(api)
        } catch {
            set(id) { $0.state = .failed(ReaderCopy.problem(error)) }
        }
    }

    // MARK: Rename and delete

    func rename(_ doc: NPDocument, title: String, subtitle: String?, api: any NeuroPalAPI) async -> Bool {
        do {
            let updated = try await api.renameDocument(id: doc.id, title: title, subtitle: subtitle)
            if let i = documents.firstIndex(where: { $0.id == doc.id }) { documents[i] = updated }
            ContinueReading.renamed(documentID: doc.id, title: updated.title)
            return true
        } catch {
            notice = "Couldn't rename it. \(ReaderCopy.problem(error))"
            return false
        }
    }

    func delete(_ doc: NPDocument, api: any NeuroPalAPI) async {
        do {
            try await api.deleteDocument(id: doc.id)
            documents.removeAll { $0.id == doc.id }
            ReadAloudPlayer.shared.stopIfReading(doc.id)
            ContinueReading.forget(documentID: doc.id)
        } catch {
            notice = "Couldn't delete “\(doc.title)”. \(ReaderCopy.problem(error))"
        }
    }
}

/// Picked files are copied into the app's temporary folder before upload
/// (the picker's access ends; iCloud files are downloaded on the way).
enum UploadStaging {
    static func stage(_ url: URL) throws -> URL {
        let folder = FileManager.default.temporaryDirectory
            .appending(path: "np-uploads/\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appending(path: url.lastPathComponent)
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?
        var copyError: Error?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { readable in
            do {
                try FileManager.default.copyItem(at: readable, to: destination)
            } catch {
                copyError = error
            }
        }
        if let error = coordinationError ?? copyError { throw error }
        return destination
    }

    static func discard(_ staged: URL) {
        let folder = staged.deletingLastPathComponent()
        guard folder.path.contains("np-uploads") else { return }
        try? FileManager.default.removeItem(at: folder)
    }
}
