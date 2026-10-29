import Foundation

extension MockNeuroPalAPI {
    public func palBreakdown(task: String) async throws -> PalBreakdown {
        await pause()
        try requireSession()
        let t = task.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { throw APIError.server(status: 400, message: "task is required") }
        return PalBreakdown(steps: [
            "Open \(t.count > 40 ? "it" : "“\(t)”") and look at it for one minute — nothing else.",
            "Write one sentence about what “done” looks like.",
            "Do the smallest first piece, for ten minutes.",
            "Stand up, drink some water.",
            "Decide: another ten minutes, or stop here for today.",
        ], provider: "mock", model: "mock")
    }

    public func palChat(message: String, context: PalChatContext?) async throws -> PalChatReply {
        await pause()
        try requireSession()
        let reply = PalChatReply(
            reply: "That sounds like a lot to hold at once. Want to pick just the next small thing together?",
            crisis: false, provider: "mock", model: "mock")
        lock.withLock {
            palChatStore.append(ChatMessage(id: UUID().uuidString, role: .user, content: message, threadId: "pal", createdAt: Date()))
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
