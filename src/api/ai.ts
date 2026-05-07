import apiClient from './client';

/*
 * WMS 자연어 업무 조회 챗봇.
 *
 * 사용자는 메뉴를 이동하지 않고 질문만 보낸다.
 * ai-service 는 질문 의도를 분류해 입고/출고/재고/피킹 데이터를 조회하고 답변한다.
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface WorkQueryResponse {
  question: string;
  intent: string;
  answer: string;
  rows: Record<string, unknown>[];
  followUp?: boolean;
}

export interface WorkQueryContext {
  intent: string;
  answer: string;
  rows: Record<string, unknown>[];
}

export interface RagChatResponse {
  question: string;
  answer: string;
}

export interface ChatRouteResponse {
  mode: 'GENERAL' | 'RAG' | 'WORK_QUERY' | 'SQL';
  originalMode?: 'GENERAL' | 'RAG' | 'WORK_QUERY' | 'SQL';
  routeReason?: string;
  fallbackApplied?: boolean;
  errorCode?: string | null;
  retryable?: boolean;
  answer: string;
  intent?: string | null;
  rows?: Record<string, unknown>[];
  followUp?: boolean;
  executionTimeMs?: number;
}

export async function askAiChat(
  message: string,
  history: ChatTurn[] = [],
  context?: WorkQueryContext,
  userName?: string,
): Promise<ChatRouteResponse> {
  const res = await apiClient.post<ChatRouteResponse>('/ai-service/chat/ask', {
    question: message,
    history,
    context,
    userName,
  });
  return res.data;
}

export async function askWorkQuery(
  message: string,
  history: ChatTurn[] = [],
  context?: WorkQueryContext,
): Promise<WorkQueryResponse> {
  const res = await apiClient.post<WorkQueryResponse>('/ai-service/work-query/ask', {
    message,
    history,
    context,
  });
  return res.data;
}

export async function askRagChat(
  question: string,
  history: ChatTurn[] = [],
): Promise<RagChatResponse> {
  const res = await apiClient.post<RagChatResponse>('/ai-service/rag/chat', {
    question,
    history,
  });
  return res.data;
}
