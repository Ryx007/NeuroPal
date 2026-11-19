import Foundation

// Pal's server calls, offline (neuropal-backend/src/routes/pal.js): the same
// validation and the same shapes, canned words. Like the server, a task or a
// message is cleaned first (`replace(/\s+/g, ' ').trim()`) and measured in
// UTF-16 units (JavaScript's String.length). The app's crisis check runs on
// the device before anything is sent (PalLogic in NPDay), so a crisis never
// reaches this mock — nor, from the app, the real server.
extension MockNeuroPalAPI {
    public func palBreakdown(task: String) async throws -> PalBreakdown {
        await pause()
        try requireSession()
        let t = Self.serverClean(task)
        if t.isEmpty { throw APIError.server(status: 400, message: "task is required") }
        if t.utf16.count > 500 { throw APIError.server(status: 422, message: "task must be 500 characters or fewer") }
        return PalBreakdown(steps: [
            "Open \(t.count > 40 ? "it" : "“\(t)”") and look at it for one minute",
            "Write one sentence about what done looks like",
            "Do the smallest first piece, for ten minutes",
            "Stand up and drink some water",
            "Decide: another ten minutes, or stop here for today",
        ], provider: "mock", model: "mock")
    }

    public func palChat(message: String, context: PalChatContext?) async throws -> PalChatReply {
        await pause()
        try requireSession()
        let text = Self.serverClean(message)
        if text.isEmpty { throw APIError.server(status: 400, message: "message is required") }
        if text.utf16.count > 1000 { throw APIError.server(status: 422, message: "message must be 1000 characters or fewer") }
        let words: String
        switch context?.state {
        case "red":
            words = "That sounds like a lot. Want to try the calming steps first? Nothing else is needed right now."
        case "yellow":
            words = "A bit off is okay. What’s one small thing we could make even smaller?"
        default:
            if let next = context?.nextAnchor, next.inMinutes <= 30 {
                words = "\(next.title) is in \(next.inMinutes) minutes, so let’s keep it small until then. What’s on your mind?"
            } else {
                words = "That sounds like a lot to hold at once. Want to pick just the next small thing together?"
            }
        }
        let reply = PalChatReply(reply: words, crisis: false, provider: "mock", model: "mock")
        lock.withLock {
            palChatStore.append(ChatMessage(id: UUID().uuidString, role: .user, content: text, threadId: "pal", createdAt: Date()))
            palChatStore.append(ChatMessage(id: UUID().uuidString, role: .assistant, content: reply.reply, threadId: "pal",
                                            createdAt: Date()))
        }
        return reply
    }

    public func clearPalChat() async throws {
        await pause()
        try requireSession()
        lock.withLock { palChatStore.removeAll() }
    }

    /// The server's `raw.replace(/\s+/g, ' ').trim()`, with JavaScript's `\s`.
    static func serverClean(_ raw: String) -> String {
        var out = String.UnicodeScalarView()
        var gap = false
        for u in raw.unicodeScalars {
            switch u.value {
            case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
                gap = true
            default:
                if gap && !out.isEmpty { out.append(" ") }
                gap = false
                out.append(u)
            }
        }
        return String(out)
    }
}
