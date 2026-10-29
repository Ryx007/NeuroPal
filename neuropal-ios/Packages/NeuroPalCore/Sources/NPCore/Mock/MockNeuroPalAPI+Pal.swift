import Foundation

// Pal's server calls, offline (neuropal-backend/src/routes/pal.js): the same
// validation and the same shapes, canned words.
extension MockNeuroPalAPI {
    public func palBreakdown(task: String) async throws -> PalBreakdown {
        await pause()
        try requireSession()
        let t = task.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { throw APIError.server(status: 400, message: "task is required") }
        if t.count > 500 { throw APIError.server(status: 422, message: "task is too long (max 500 characters)") }
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
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { throw APIError.server(status: 400, message: "message is required") }
        if text.count > 1000 { throw APIError.server(status: 422, message: "message is too long (max 1000 characters)") }
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
}
