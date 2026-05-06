import { useEffect, useRef } from 'react';
import { subscribe } from '@/lib/stompClient';

export function useStompSubscription<T = unknown>(
  destination: string | null | undefined,
  handler: (event: T) => void,
) {
  const handlerRef = useRef(handler);

  // ref.current는 render 중엔 직접 대입 금지(react-hooks/refs) → effect에서 갱신
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!destination) return;
    const unsubscribe = subscribe(destination, (event) => handlerRef.current(event as T));
    return unsubscribe;
  }, [destination]);
}
