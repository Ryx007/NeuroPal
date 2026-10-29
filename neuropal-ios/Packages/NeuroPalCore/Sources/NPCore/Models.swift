import Foundation
@_exported import NPTokens

// The server's JSON, as the backend sends it (docs/BRAIN.md §4). Every
// optional field decodes leniently: an older or newer server never breaks
// a screen. Mongo ids arrive as `_id` (lean documents) or `id` (public user).

public struct NPUser: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var email: String
    public var name: String?
    public var timezone: String?
    public var locale: String?
    /// The shared look object (`Tokens.normalizeAppearance` makes it valid).
    public var appearance: JSONValue?

    public init(id: String, email: String, name: String? = nil, timezone: String? = nil, locale: String? = nil,
                appearance: JSONValue? = nil) {
        self.id = id
        self.email = email
        self.name = name
        self.timezone = timezone
        self.locale = locale
        self.appearance = appearance
    }

    enum CodingKeys: String, CodingKey { case id, _id, email, name, timezone, locale, appearance }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? c.decode(String.self, forKey: ._id)
        email = try c.decodeIfPresent(String.self, forKey: .email) ?? ""
        name = try? c.decodeIfPresent(String.self, forKey: .name)
        timezone = try? c.decodeIfPresent(String.self, forKey: .timezone)
        locale = try? c.decodeIfPresent(String.self, forKey: .locale)
        appearance = try? c.decodeIfPresent(JSONValue.self, forKey: .appearance)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(email, forKey: .email)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(timezone, forKey: .timezone)
        try c.encodeIfPresent(locale, forKey: .locale)
        try c.encodeIfPresent(appearance, forKey: .appearance)
    }
}

/// GET /api/auth/config — what the sign-in screen offers.
public struct AuthConfig: Codable, Hashable, Sendable {
    public var localMode: Bool
    /// "invite" | "open" | "closed"
    public var signup: String
    public init(localMode: Bool, signup: String) {
        self.localMode = localMode
        self.signup = signup
    }

    /// An older server without these fields asks for sign-in with an invite.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        localMode = (try? c.decodeIfPresent(Bool.self, forKey: .localMode)) ?? false
        let raw = ((try? c.decodeIfPresent(String.self, forKey: .signup)) ?? "invite").lowercased()
        signup = ["invite", "open", "closed"].contains(raw) ? raw : "invite"
    }

    /// Sign-up is possible here (with or without an invite).
    public var signupOpen: Bool { signup != "closed" }
    /// Creating an account needs the server's invite code.
    public var needsInvite: Bool { signup == "invite" }
}

/// POST /api/auth/login | /register → `{token, user}`
public struct AuthResult: Codable, Hashable, Sendable {
    public var token: String
    public var user: NPUser
    public init(token: String, user: NPUser) {
        self.token = token
        self.user = user
    }
}

/// GET /api/auth/me → the public user, plus a fresh `token` when the
/// current one is a day old (the client swaps it in).
public struct MeResult: Hashable, Sendable {
    public var user: NPUser
    public var refreshedToken: String?
    public init(user: NPUser, refreshedToken: String? = nil) {
        self.user = user
        self.refreshedToken = refreshedToken
    }
}

public enum DocumentType: String, Codable, Sendable, CaseIterable {
    case pdf, epub, docx, pptx, md, txt, djvu, arxiv, web
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = DocumentType(rawValue: raw) ?? .unknown
    }
}

/// The ingest state machine: pending → parsing → chunking → embedding → ready | failed.
public enum DocumentStatus: String, Codable, Sendable, CaseIterable {
    case pending, parsing, chunking, embedding, ready, failed
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = DocumentStatus(rawValue: raw) ?? .unknown
    }

    /// Still being processed (the list polls while any document is).
    public var isProcessing: Bool { [.pending, .parsing, .chunking, .embedding].contains(self) }
}

public struct NPDocument: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var subtitle: String?
    public var type: DocumentType
    public var status: DocumentStatus
    /// INGEST progress 0…1 (not reading progress).
    public var progress: Double?
    public var pageCount: Int?
    public var wordCount: Int?
    /// Reading progress 0…1, joined from ReadingSession by GET /api/documents.
    public var readingProgress: Double?
    public var lastReadAt: Date?
    public var createdAt: Date?
    public var ingestError: String?

    public init(id: String, title: String, subtitle: String? = nil, type: DocumentType, status: DocumentStatus,
                progress: Double? = nil, pageCount: Int? = nil, wordCount: Int? = nil, readingProgress: Double? = nil,
                lastReadAt: Date? = nil, createdAt: Date? = nil, ingestError: String? = nil) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.type = type
        self.status = status
        self.progress = progress
        self.pageCount = pageCount
        self.wordCount = wordCount
        self.readingProgress = readingProgress
        self.lastReadAt = lastReadAt
        self.createdAt = createdAt
        self.ingestError = ingestError
    }

    enum CodingKeys: String, CodingKey {
        case id, _id, title, subtitle, type, status, progress, pageCount, wordCount, readingProgress, lastReadAt,
             createdAt, ingestError
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: ._id) ?? c.decode(String.self, forKey: .id)
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? "Untitled"
        subtitle = try? c.decodeIfPresent(String.self, forKey: .subtitle)
        type = (try? c.decodeIfPresent(DocumentType.self, forKey: .type)) ?? .unknown
        status = (try? c.decodeIfPresent(DocumentStatus.self, forKey: .status)) ?? .unknown
        progress = try? c.decodeIfPresent(Double.self, forKey: .progress)
        pageCount = try? c.decodeIfPresent(Int.self, forKey: .pageCount)
        wordCount = try? c.decodeIfPresent(Int.self, forKey: .wordCount)
        readingProgress = try? c.decodeIfPresent(Double.self, forKey: .readingProgress)
        lastReadAt = try? c.decodeIfPresent(Date.self, forKey: .lastReadAt)
        createdAt = try? c.decodeIfPresent(Date.self, forKey: .createdAt)
        ingestError = try? c.decodeIfPresent(String.self, forKey: .ingestError)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(title, forKey: .title)
        try c.encodeIfPresent(subtitle, forKey: .subtitle)
        try c.encode(type, forKey: .type)
        try c.encode(status, forKey: .status)
        try c.encodeIfPresent(progress, forKey: .progress)
        try c.encodeIfPresent(pageCount, forKey: .pageCount)
        try c.encodeIfPresent(wordCount, forKey: .wordCount)
        try c.encodeIfPresent(readingProgress, forKey: .readingProgress)
        try c.encodeIfPresent(lastReadAt, forKey: .lastReadAt)
        try c.encodeIfPresent(createdAt, forKey: .createdAt)
        try c.encodeIfPresent(ingestError, forKey: .ingestError)
    }
}

/// A real chapter: `startParagraph` indexes the paragraphs of DocumentText.text
/// (split on blank lines).
public struct TocEntry: Codable, Hashable, Sendable {
    public var title: String
    public var order: Int?
    public var startParagraph: Int?
    public var startPage: Int?
    public init(title: String, order: Int? = nil, startParagraph: Int? = nil, startPage: Int? = nil) {
        self.title = title
        self.order = order
        self.startParagraph = startParagraph
        self.startPage = startPage
    }
}

/// A real page anchor in the same paragraph domain.
public struct PageAnchor: Codable, Hashable, Sendable {
    public var page: Int
    public var startParagraph: Int
    public init(page: Int, startParagraph: Int) {
        self.page = page
        self.startParagraph = startParagraph
    }
}

/// GET /api/documents/:id/text — the reader and read-aloud source.
public struct DocumentText: Codable, Hashable, Sendable {
    public var id: String
    public var title: String
    public var text: String
    public var pageCount: Int?
    public var wordCount: Int?
    public var toc: [TocEntry]
    public var pageMap: [PageAnchor]
    /// "chunks" | "raw-file"
    public var source: String?

    public init(id: String, title: String, text: String, pageCount: Int? = nil, wordCount: Int? = nil,
                toc: [TocEntry] = [], pageMap: [PageAnchor] = [], source: String? = nil) {
        self.id = id
        self.title = title
        self.text = text
        self.pageCount = pageCount
        self.wordCount = wordCount
        self.toc = toc
        self.pageMap = pageMap
        self.source = source
    }

    enum CodingKeys: String, CodingKey { case id, title, text, pageCount, wordCount, toc, pageMap, source }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? ""
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
        text = (try? c.decodeIfPresent(String.self, forKey: .text)) ?? ""
        pageCount = try? c.decodeIfPresent(Int.self, forKey: .pageCount)
        wordCount = try? c.decodeIfPresent(Int.self, forKey: .wordCount)
        toc = (try? c.decodeIfPresent([TocEntry].self, forKey: .toc)) ?? []
        pageMap = (try? c.decodeIfPresent([PageAnchor].self, forKey: .pageMap)) ?? []
        source = try? c.decodeIfPresent(String.self, forKey: .source)
    }
}

/// GET /api/documents/:id/progress — the resume point (nil fields: never opened).
public struct ReadingProgress: Codable, Hashable, Sendable {
    public var progress: Double?
    public var lastWordIndex: Int?
    public var lastPage: Int?
    public var lastOpenedAt: Date?
    public init(progress: Double? = nil, lastWordIndex: Int? = nil, lastPage: Int? = nil, lastOpenedAt: Date? = nil) {
        self.progress = progress
        self.lastWordIndex = lastWordIndex
        self.lastPage = lastPage
        self.lastOpenedAt = lastOpenedAt
    }
}

/// PATCH /api/documents/:id/progress body.
public struct ReadingProgressUpdate: Codable, Hashable, Sendable {
    public var progress: Double
    public var lastWordIndex: Int
    public var lastPage: Int?
    public var timeSpentSec: Int?
    public init(progress: Double, lastWordIndex: Int, lastPage: Int? = nil, timeSpentSec: Int? = nil) {
        self.progress = progress
        self.lastWordIndex = lastWordIndex
        self.lastPage = lastPage
        self.timeSpentSec = timeSpentSec
    }
}

public struct Citation: Codable, Hashable, Sendable {
    public var chunkId: String?
    public var page: Int?
    public var sectionHeading: String?
    public var excerpt: String?
    public init(chunkId: String? = nil, page: Int? = nil, sectionHeading: String? = nil, excerpt: String? = nil) {
        self.chunkId = chunkId
        self.page = page
        self.sectionHeading = sectionHeading
        self.excerpt = excerpt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        chunkId = try? c.decodeIfPresent(String.self, forKey: .chunkId)
        if let p = try? c.decodeIfPresent(Int.self, forKey: .page) {
            page = p
        } else if let p = try? c.decodeIfPresent(Double.self, forKey: .page), p.isFinite {
            page = Int(p)
        } else {
            page = nil
        }
        sectionHeading = try? c.decodeIfPresent(String.self, forKey: .sectionHeading)
        excerpt = try? c.decodeIfPresent(String.self, forKey: .excerpt)
    }
}

/// POST /api/documents/:id/query → grounded answer with its sources.
public struct QueryAnswer: Codable, Hashable, Sendable {
    public var answer: String
    public var citations: [Citation]
    public var threadId: String?
    /// "rag" | "fallback"
    public var mode: String?
    public var model: String?
    public var provider: String?
    public var chunksUsed: Int?
    public init(answer: String, citations: [Citation] = [], threadId: String? = nil, mode: String? = nil,
                model: String? = nil, provider: String? = nil, chunksUsed: Int? = nil) {
        self.answer = answer
        self.citations = citations
        self.threadId = threadId
        self.mode = mode
        self.model = model
        self.provider = provider
        self.chunksUsed = chunksUsed
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        answer = try c.decode(String.self, forKey: .answer)
        citations = (try? c.decodeIfPresent([Citation].self, forKey: .citations)) ?? []
        threadId = try? c.decodeIfPresent(String.self, forKey: .threadId)
        mode = try? c.decodeIfPresent(String.self, forKey: .mode)
        model = try? c.decodeIfPresent(String.self, forKey: .model)
        provider = try? c.decodeIfPresent(String.self, forKey: .provider)
        chunksUsed = try? c.decodeIfPresent(Int.self, forKey: .chunksUsed)
    }
}

public struct ChatMessage: Codable, Hashable, Sendable, Identifiable {
    public enum Role: String, Codable, Sendable { case user, assistant, system }
    public var id: String
    public var role: Role
    public var content: String
    public var citations: [Citation]
    public var threadId: String?
    public var createdAt: Date?

    public init(id: String, role: Role, content: String, citations: [Citation] = [], threadId: String? = nil,
                createdAt: Date? = nil) {
        self.id = id
        self.role = role
        self.content = content
        self.citations = citations
        self.threadId = threadId
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey { case id, _id, role, content, citations, threadId, createdAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: ._id) ?? c.decode(String.self, forKey: .id)
        role = (try? c.decodeIfPresent(Role.self, forKey: .role)) ?? .assistant
        content = (try? c.decodeIfPresent(String.self, forKey: .content)) ?? ""
        citations = (try? c.decodeIfPresent([Citation].self, forKey: .citations)) ?? []
        threadId = try? c.decodeIfPresent(String.self, forKey: .threadId)
        createdAt = try? c.decodeIfPresent(Date.self, forKey: .createdAt)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(role, forKey: .role)
        try c.encode(content, forKey: .content)
        try c.encode(citations, forKey: .citations)
        try c.encodeIfPresent(threadId, forKey: .threadId)
        try c.encodeIfPresent(createdAt, forKey: .createdAt)
    }
}

/// GET /api/documents/:id/ticket — a 12 h read pass for one document, for
/// loads that can't send a header (page images, EPUB files). nil in local mode.
public struct DocTicket: Codable, Hashable, Sendable {
    public var ticket: String?
    public var expiresAt: Date?
    public init(ticket: String?, expiresAt: Date? = nil) {
        self.ticket = ticket
        self.expiresAt = expiresAt
    }
}

/// GET /api/documents/:id/epub-manifest
public struct EpubManifest: Codable, Hashable, Sendable {
    public struct SpineItem: Codable, Hashable, Sendable {
        public var index: Int
        public var href: String
        public init(index: Int, href: String) {
            self.index = index
            self.href = href
        }
    }

    public struct TocNode: Codable, Hashable, Sendable {
        public var title: String
        public var href: String?
        public var anchor: String?
        public var children: [TocNode]
        public init(title: String, href: String? = nil, anchor: String? = nil, children: [TocNode] = []) {
            self.title = title
            self.href = href
            self.anchor = anchor
            self.children = children
        }

        enum CodingKeys: String, CodingKey { case title, href, anchor, children }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
            href = try? c.decodeIfPresent(String.self, forKey: .href)
            anchor = try? c.decodeIfPresent(String.self, forKey: .anchor)
            children = (try? c.decodeIfPresent([TocNode].self, forKey: .children)) ?? []
        }
    }

    public struct PrintPage: Codable, Hashable, Sendable {
        public var page: String
        public var href: String
        public var anchor: String?
        public init(page: String, href: String, anchor: String? = nil) {
            self.page = page
            self.href = href
            self.anchor = anchor
        }

        enum CodingKeys: String, CodingKey { case page, href, anchor }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            // Print page labels can be numbers or roman numerals ("xii").
            if let n = try? c.decode(Int.self, forKey: .page) {
                page = String(n)
            } else {
                page = (try? c.decode(String.self, forKey: .page)) ?? ""
            }
            href = (try? c.decode(String.self, forKey: .href)) ?? ""
            anchor = try? c.decodeIfPresent(String.self, forKey: .anchor)
        }
    }

    public var id: String
    public var title: String
    public var spine: [SpineItem]
    public var toc: [TocNode]
    public var pageList: [PrintPage]

    public init(id: String, title: String, spine: [SpineItem], toc: [TocNode] = [], pageList: [PrintPage] = []) {
        self.id = id
        self.title = title
        self.spine = spine
        self.toc = toc
        self.pageList = pageList
    }

    enum CodingKeys: String, CodingKey { case id, title, spine, toc, pageList }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? ""
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
        spine = (try? c.decodeIfPresent([SpineItem].self, forKey: .spine)) ?? []
        toc = (try? c.decodeIfPresent([TocNode].self, forKey: .toc)) ?? []
        pageList = (try? c.decodeIfPresent([PrintPage].self, forKey: .pageList)) ?? []
    }
}

/// POST /api/pal/breakdown → 3–7 small steps. A task that sounds like a
/// crisis never reaches the model: `{steps: [], crisis: true, reply}` with
/// the server's careful reply (the app shows the calming steps and help lines).
public struct PalBreakdown: Codable, Hashable, Sendable {
    public var steps: [String]
    public var provider: String?
    public var model: String?
    /// The server answered with its fixed careful reply instead of steps.
    public var crisis: Bool
    /// That reply (with `crisis`).
    public var reply: String?

    public init(steps: [String], provider: String? = nil, model: String? = nil, crisis: Bool = false,
                reply: String? = nil) {
        self.steps = steps
        self.provider = provider
        self.model = model
        self.crisis = crisis
        self.reply = reply
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        crisis = (try? c.decodeIfPresent(Bool.self, forKey: .crisis)) ?? false
        reply = try? c.decodeIfPresent(String.self, forKey: .reply)
        // A crisis answer may come without steps at all.
        if crisis {
            steps = (try? c.decodeIfPresent([String].self, forKey: .steps)) ?? []
        } else {
            steps = try c.decode([String].self, forKey: .steps)
        }
        provider = try? c.decodeIfPresent(String.self, forKey: .provider)
        model = try? c.decodeIfPresent(String.self, forKey: .model)
    }
}

/// POST /api/pal/chat `context` — what Pal may know about right now.
public struct PalChatContext: Codable, Hashable, Sendable {
    public struct NextAnchor: Codable, Hashable, Sendable {
        public var title: String
        public var at: String
        public var inMinutes: Int
        public init(title: String, at: String, inMinutes: Int) {
            self.title = title
            self.at = at
            self.inMinutes = inMinutes
        }
    }

    /// "green" | "yellow" | "red"
    public var state: String?
    /// Local time "HH:MM".
    public var localTime: String?
    public var nextAnchor: NextAnchor?
    public var minimumDay: [String]
    public var palName: String?
    public var talkStyle: String?
    public var people: Bool?

    public init(state: String? = nil, localTime: String? = nil, nextAnchor: NextAnchor? = nil, minimumDay: [String] = [],
                palName: String? = nil, talkStyle: String? = nil, people: Bool? = nil) {
        self.state = state
        self.localTime = localTime
        self.nextAnchor = nextAnchor
        self.minimumDay = minimumDay
        self.palName = palName
        self.talkStyle = talkStyle
        self.people = people
    }
}

/// POST /api/pal/chat → `{reply, crisis}`. `crisis` = the server answered with
/// its fixed careful reply; the app shows the calming steps and help lines.
public struct PalChatReply: Codable, Hashable, Sendable {
    public var reply: String
    public var crisis: Bool
    public var provider: String?
    public var model: String?
    public init(reply: String, crisis: Bool = false, provider: String? = nil, model: String? = nil) {
        self.reply = reply
        self.crisis = crisis
        self.provider = provider
        self.model = model
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reply = try c.decode(String.self, forKey: .reply)
        crisis = (try? c.decodeIfPresent(Bool.self, forKey: .crisis)) ?? false
        provider = try? c.decodeIfPresent(String.self, forKey: .provider)
        model = try? c.decodeIfPresent(String.self, forKey: .model)
    }
}
