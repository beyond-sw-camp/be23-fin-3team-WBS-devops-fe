import { useEffect, useRef } from 'react';
import { useStompSubscription } from './useStompSubscription';

/**
 * STOMP 구독 + orderId(or 임의 키)별 debounce.
 * 같은 키로 debounceMs 안에 여러 알림이 와도 마지막 1번만 핸들러가 실행된다.
 * (예: 마지막 품목 처리 시 PICKED + COMPLETED 동시 발송)
 */
export function useStompInvalidate<T = { orderId: string }>(
  destination: string | null | undefined,
  handler: (event: T) => void,
  options?: { debounceMs?: number; getKey?: (event: T) => string },
) {
  const handlerRef = useRef(handler);

  // ref.current는 render 중엔 직접 대입 금지(react-hooks/refs) → effect에서 갱신
  useEffect(() => {
    handlerRef.current = handler;
  });

  const debounceMs = options?.debounceMs ?? 200;
  const getKey = options?.getKey ?? ((e: T) => (e as unknown as { orderId: string }).orderId);

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useStompSubscription<T>(destination, (event) => {
    const key = getKey(event) ?? '__default__';
    const timers = timersRef.current;
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      handlerRef.current(event);
      timers.delete(key);
    }, debounceMs);
    timers.set(key, timer);
  });

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);
}
