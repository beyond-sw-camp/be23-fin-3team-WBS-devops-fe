import { useState, useCallback, useRef } from 'react';

export interface CanvasShape {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  fill: string;
  stroke: string;
  data?: Record<string, unknown>;
}

export type EditorMode = 'select' | 'draw';

const MIN_SIZE = 30;

export function useCanvasEditor(initialShapes: CanvasShape[] = []) {
  const [shapes, setShapes] = useState<CanvasShape[]>(initialShapes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('select');
  const [scale, setScale] = useState(1);
  const historyRef = useRef<CanvasShape[][]>([initialShapes]);
  const historyIndexRef = useRef(0);

  /* ── history helpers ── */
  const pushHistory = useCallback((next: CanvasShape[]) => {
    const idx = historyIndexRef.current + 1;
    historyRef.current = historyRef.current.slice(0, idx);
    historyRef.current.push(next);
    historyIndexRef.current = idx;
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    setShapes(historyRef.current[historyIndexRef.current]);
    setSelectedId(null);
  }, []);

  /* ── drawing state (not React state — perf) ── */
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const drawingRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const onStageMouseDown = useCallback(
    (pos: { x: number; y: number }) => {
      if (mode !== 'draw') return;
      drawStart.current = pos;
      drawingRect.current = { x: pos.x, y: pos.y, w: 0, h: 0 };
    },
    [mode],
  );

  const onStageMouseMove = useCallback(
    (pos: { x: number; y: number }) => {
      if (mode !== 'draw' || !drawStart.current) return null;
      const s = drawStart.current;
      const rect = {
        x: Math.min(s.x, pos.x),
        y: Math.min(s.y, pos.y),
        w: Math.abs(pos.x - s.x),
        h: Math.abs(pos.y - s.y),
      };
      drawingRect.current = rect;
      return rect;
    },
    [mode],
  );

  const onStageMouseUp = useCallback((): CanvasShape | null => {
    if (mode !== 'draw' || !drawingRect.current) return null;
    const r = drawingRect.current;
    drawStart.current = null;
    drawingRect.current = null;
    if (r.w < MIN_SIZE || r.h < MIN_SIZE) return null;
    const newShape: CanvasShape = {
      id: `shape-${Date.now()}`,
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      rotation: 0,
      label: '',
      fill: '#d9f7be',
      stroke: '#52c41a',
    };
    const next = [...shapes, newShape];
    setShapes(next);
    pushHistory(next);
    setSelectedId(newShape.id);
    return newShape;
  }, [mode, shapes, pushHistory]);

  /* ── shape ops ── */
  const updateShape = useCallback(
    (id: string, patch: Partial<CanvasShape>) => {
      const next = shapes.map((s) => (s.id === id ? { ...s, ...patch } : s));
      setShapes(next);
      pushHistory(next);
    },
    [shapes, pushHistory],
  );

  /** 다중 도형을 한 번에 커밋 (undo 히스토리 1회) */
  const commitShapes = useCallback(
    (next: CanvasShape[]) => {
      setShapes(next);
      pushHistory(next);
    },
    [pushHistory],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    const next = shapes.filter((s) => s.id !== selectedId);
    setShapes(next);
    pushHistory(next);
    setSelectedId(null);
  }, [selectedId, shapes, pushHistory]);

  const addShapes = useCallback(
    (incoming: CanvasShape[]) => {
      if (incoming.length === 0) return;
      const next = [...shapes, ...incoming];
      setShapes(next);
      pushHistory(next);
    },
    [shapes, pushHistory],
  );

  /* ── zoom ── */
  const zoomIn = useCallback(() => setScale((s) => Math.min(3, s * 1.2)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(0.3, s / 1.2)), []);
  const zoomFit = useCallback(() => setScale(1), []);
  const onWheel = useCallback((deltaY: number) => {
    setScale((s) => {
      const next = deltaY > 0 ? s * 0.9 : s * 1.1;
      return Math.max(0.3, Math.min(3, next));
    });
  }, []);

  return {
    shapes,
    setShapes,
    selectedId,
    setSelectedId,
    mode,
    setMode,
    scale,
    setScale,
    undo,
    onStageMouseDown,
    onStageMouseMove,
    onStageMouseUp,
    updateShape,
    commitShapes,
    deleteSelected,
    addShapes,
    zoomIn,
    zoomOut,
    zoomFit,
    onWheel,
  };
}
