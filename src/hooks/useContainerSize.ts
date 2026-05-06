import { useState, useEffect, useRef, useCallback } from 'react';

interface Size {
  width: number;
  height: number;
}

export type UseContainerSizeOptions = {
  heightOffset?: number;
  /** 고정 높이(div+CSS)일 때 rect.height만 사용 — 무한 스크롤/피드백 루프 방지 */
  useBoundingRectHeight?: boolean;
};

function resolveOpts(input: UseContainerSizeOptions | number | undefined): { heightOffset: number; useBoundingRectHeight: boolean } {
  if (typeof input === 'number') return { heightOffset: input, useBoundingRectHeight: false };
  return {
    heightOffset: input?.heightOffset ?? 0,
    useBoundingRectHeight: input?.useBoundingRectHeight ?? false,
  };
}

export function useContainerSize(opts: UseContainerSizeOptions | number = 0): {
  containerRef: (node: HTMLDivElement | null) => void;
  size: Size;
} {
  const { heightOffset, useBoundingRectHeight } = resolveOpts(opts);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [size, setSize] = useState<Size>({ width: 800, height: 500 });

  const measure = useCallback(() => {
    if (!nodeRef.current) return;
    const rect = nodeRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let w = Math.floor(rect.width);
    let h = useBoundingRectHeight
      ? Math.floor(rect.height)
      : Math.floor(vh - rect.top - heightOffset);
    /** 뷰포트 밖·문서 무한 성장으로 커진 rect는 스테이지에 쓰지 않음 (ResizeObserver ↔ state 루프 방지) */
    const maxW = Math.max(200, Math.floor(vw - Math.max(0, rect.left) - 4));
    const maxH = Math.max(200, Math.floor(vh - Math.max(0, rect.top) - 4));
    w = Math.min(Math.max(200, w), maxW);
    h = Math.min(Math.max(200, h), maxH);
    setSize((prev) => {
      if (prev.width === w && prev.height === h) return prev;
      return { width: w, height: h };
    });
  }, [heightOffset, useBoundingRectHeight]);

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      nodeRef.current = node;
      if (node) {
        const ro = new ResizeObserver(measure);
        ro.observe(node);
        roRef.current = ro;
        measure();
      }
    },
    [measure],
  );

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return { containerRef, size };
}
