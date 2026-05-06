import { useCallback, useState } from 'react';
import {
  askAiChat,
  type ChatTurn,
  type RagChatResponse,
  type WorkQueryContext,
  type WorkQueryResponse,
} from '@/api/ai';

export type AssistantRender =
  | { kind: 'work-query'; data: WorkQueryResponse }
  | { kind: 'rag'; data: RagChatResponse }
  | { kind: 'error'; message: string };

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
}

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  render: AssistantRender;
}

export type ChatMessage = UserMessage | AssistantMessage;

let _seq = 0;
const nextId = () => `m_${Date.now()}_${++_seq}`;

export function useChatSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);

  const pushAssistant = (render: AssistantRender) => {
    const id = nextId();
    setMessages((prev) => [...prev, { id, role: 'assistant', render }]);
    return id;
  };

  const cancel = useCallback(() => {
    setPending(false);
  }, []);

  const clear = useCallback(() => {
    cancel();
    setMessages([]);
  }, [cancel]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      const userMsg: UserMessage = { id: nextId(), role: 'user', text: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setPending(true);

      try {
        const history = buildHistory(messages);
        const data = await askAiChat(trimmed, history, buildContext(messages));
        if (data.mode === 'RAG') {
          pushAssistant({
            kind: 'rag',
            data: {
              question: trimmed,
              answer: data.answer,
            },
          });
        } else {
          pushAssistant({
            kind: 'work-query',
            data: {
              question: trimmed,
              intent: data.intent ?? 'PENDING_WORK',
              answer: data.answer,
              rows: data.rows ?? [],
              followUp: data.followUp ?? false,
            },
          });
        }
      } catch (err) {
        pushAssistant({ kind: 'error', message: extractErr(err) });
      } finally {
        setPending(false);
      }
    },
    [messages, pending],
  );

  return { messages, pending, send, cancel, clear };
}

function buildContext(messages: ChatMessage[]): WorkQueryContext | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === 'assistant' && message.render.kind === 'work-query') {
      const data = message.render.data;
      if (data.followUp) {
        continue;
      }
      return {
        intent: data.intent,
        answer: data.answer,
        rows: data.rows.slice(0, 8),
      };
    }
  }
  return undefined;
}

function buildHistory(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      turns.push({ role: 'user', content: message.text });
    } else if (message.render.kind === 'work-query') {
      turns.push({ role: 'assistant', content: message.render.data.answer });
    } else if (message.render.kind === 'rag') {
      turns.push({ role: 'assistant', content: message.render.data.answer });
    }
  }
  return turns.slice(-6);
}

function extractErr(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
    if (e.response?.data?.message) {
      return e.response.data.message;
    }
    if (e.response?.status === 500) {
      return '업무 데이터를 조회하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
    }
    if (e.response?.status === 404) {
      return 'AI 업무 조회 API를 찾을 수 없습니다. ai-service와 gateway가 재실행됐는지 확인해주세요.';
    }
    if (e.response?.status) {
      return `요청을 처리하지 못했습니다. 상태 코드: ${e.response.status}`;
    }
    return e.message ?? '알 수 없는 오류';
  }
  return String(err);
}
