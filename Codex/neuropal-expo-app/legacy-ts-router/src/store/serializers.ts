import type { ChatMessage, NpDocument } from "@/models/types";

type PersistedDocument = Omit<NpDocument, "lastOpened"> & {
  lastOpened?: string;
};

type PersistedMessage = Omit<ChatMessage, "at"> & {
  at: string;
};

export function serializeDocuments(docs: NpDocument[]): PersistedDocument[] {
  return docs.map((doc) => ({
    ...doc,
    lastOpened: doc.lastOpened ? doc.lastOpened.toISOString() : undefined,
  }));
}

export function deserializeDocuments(docs: PersistedDocument[] = []): NpDocument[] {
  return docs.map((doc) => ({
    ...doc,
    lastOpened: doc.lastOpened ? new Date(doc.lastOpened) : undefined,
  }));
}

export function serializeMessages(messages: ChatMessage[]): PersistedMessage[] {
  return messages.map((message) => ({
    ...message,
    at: message.at.toISOString(),
  }));
}

export function deserializeMessages(messages: PersistedMessage[] = []): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    at: new Date(message.at),
  }));
}
