import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';
import apiClient from '@/api/client';

type Listener = (event: unknown) => void;

const buildBrokerBaseUrl = () => {
  const raw = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  // 상대경로(/api 등)면 현재 origin을 앞에 붙여 절대 URL로 만든다
  const absolute = raw.startsWith('http') ? raw : `${window.location.origin}${raw}`;
  return `${absolute.replace(/^http/, 'ws')}/stock-service/ws`;
};

/** GET /account-service/user/ws-ticket — 단기 ws 인증 ticket (5분 만료) */
const fetchWsTicket = async (): Promise<string> => {
  const res = await apiClient.get<{ ticket: string; expiresAt?: string }>('/account-service/user/ws-ticket');
  return res.data.ticket;
};

let client: Client | null = null;
const listeners = new Map<string, Set<Listener>>();
const subscriptions = new Map<string, StompSubscription>();

const ensureSubscribed = (destination: string) => {
  if (!client || !client.connected) return;
  if (subscriptions.has(destination)) return;
  const sub = client.subscribe(destination, (msg: IMessage) => {
    let payload: unknown;
    try {
      payload = JSON.parse(msg.body);
    } catch {
      payload = msg.body;
    }
    listeners.get(destination)?.forEach((fn) => fn(payload));
  });
  subscriptions.set(destination, sub);
};

const resubscribeAll = () => {
  listeners.forEach((_, destination) => ensureSubscribed(destination));
};

export const activateStomp = () => {
  if (client) return;
  client = new Client({
    brokerURL: buildBrokerBaseUrl(),
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    // 매 connect 직전에 단기 ticket 발급 → ws URL에 query string으로 부착
    // (재연결 시에도 자동으로 새 ticket으로 갱신됨)
    beforeConnect: async () => {
      try {
        const ticket = await fetchWsTicket();
        if (client) {
          client.brokerURL = `${buildBrokerBaseUrl()}?ticket=${encodeURIComponent(ticket)}`;
        }
      } catch (err) {
        console.error('[STOMP] ws-ticket 발급 실패', err);
      }
    },
    onConnect: () => {
      resubscribeAll();
    },
    onStompError: (frame) => {
      console.error('[STOMP] broker error', frame.headers['message'], frame.body);
    },
  });
  client.activate();
};

export const deactivateStomp = () => {
  if (!client) return;
  subscriptions.forEach((sub) => sub.unsubscribe());
  subscriptions.clear();
  void client.deactivate();
  client = null;
};

export const subscribe = (destination: string, listener: Listener): (() => void) => {
  let set = listeners.get(destination);
  if (!set) {
    set = new Set();
    listeners.set(destination, set);
  }
  set.add(listener);
  ensureSubscribed(destination);

  return () => {
    const s = listeners.get(destination);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) {
      listeners.delete(destination);
      const sub = subscriptions.get(destination);
      if (sub) {
        sub.unsubscribe();
        subscriptions.delete(destination);
      }
    }
  };
};
