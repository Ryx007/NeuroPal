import axios from "axios";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "";

export const apiClient = axios.create({
  baseURL: API_BASE_URL || undefined,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

function buildLocalAnswer(question, excerpt) {
  const snippet = excerpt ? excerpt.slice(0, 220) : "";

  if (/summaris|summary|plain language/i.test(question)) {
    return {
      answer: `In plain language: ${snippet || "this passage"} is describing a calmer reading environment that reduces cognitive load and helps the reader stay with the material.`,
      citations: ["local-mock"],
    };
  }

  return {
    answer: `This is a local fallback answer because no API base URL is configured. The key idea in the selected passage is that synchronized reading, gentler formatting, and reduced sensory friction can make hard material easier to stay with. Source excerpt: "${snippet}"`,
    citations: ["local-mock"],
  };
}

export async function askReaderQuestion({
  documentId,
  paragraphId,
  question,
  excerpt,
}) {
  if (!API_BASE_URL) {
    return buildLocalAnswer(question, excerpt);
  }

  const { data } = await apiClient.post(`/documents/${documentId}/query`, {
    paragraphId,
    question,
    excerpt,
  });

  return {
    answer: data?.answer || buildLocalAnswer(question, excerpt).answer,
    citations: Array.isArray(data?.citations) ? data.citations : [],
  };
}
