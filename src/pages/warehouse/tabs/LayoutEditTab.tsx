import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { InputNumber, Button, Space, Tooltip, App } from 'antd';
import {
  SelectOutlined, EditOutlined,
  ZoomInOutlined, ZoomOutOutlined, ExpandOutlined, UndoOutlined, RedoOutlined, DeleteOutlined, SaveOutlined,
  CopyOutlined, AlignLeftOutlined, AlignCenterOutlined,
} from '@ant-design/icons';
import { Stage, Layer, Rect, Group, Transformer, Text as KonvaText, Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import { useQueryClient } from '@tanstack/react-query';
import type { ZoneType, ZoneLayout } from '@/types/warehouse';
import { useZonesByWarehouse, useZoneLayouts, useWarehouseCanvas } from '@/hooks/useWarehouseQuery';
import { useProductCategoryRoots } from '@/hooks/useMasterQuery';
import { useContainerSize } from '@/hooks/useContainerSize';
import * as warehouseApi from '@/api/warehouse';
import { ZONE_TYPE_LABEL } from '@/utils/labels';
import {
  EDITOR_CANVAS_BG,
  EDITOR_ZONE_FILL,
  EDITOR_ZONE_FILL_SELECTED,
  EDITOR_ZONE_BORDER,
  EDITOR_ZONE_CHIP_ACTIVE,
  EDITOR_ZONE_STROKE_PX,
  EDITOR_CYAN,
  EDITOR_FIT_CONTENT_RATIO,
  CAD_MAJOR_WORLD,
  fitWorldBoundsToViewport,
  type WorldContentBounds,
} from '@/pages/warehouse/warehouseEditorCanvasShared';
import { EditorInfiniteGridScreen } from '@/pages/warehouse/EditorInfiniteGridScreen';
const ZONE_NAME_BY_CATEGORY: Record<string, string> = {
  전자기기: '전자기기 구역',
  가전제품: '가전제품 구역',
  생활용품: '생활용품 구역',
  입고존: '입고 대기존',
  출고존: '출고 대기존',
  불량존: '불량존',
};

function normalizeCategoryForZoneType(zoneType: ZoneType, category: string | undefined): string {
  if (zoneType === 'INBOUND') return '입고존';
  if (zoneType === 'OUTBOUND') return '출고존';
  if (zoneType === 'DEFECT') return '불량존';
  // STORAGE: 마스터에 등록된 어떤 카테고리명이든 그대로 사용. 빈 값일 때만 기본값.
  return String(category ?? '').trim() || '전자기기';
}

// 카테고리명 해시 기반 팔레트 — CATEGORY_STYLE에 명시된 것 외에 등록된 임의 카테고리도 시각 구분.
const CATEGORY_FALLBACK_PALETTE: { fill: string; stroke: string }[] = [
  { fill: '#dce6f5', stroke: '#a8bcd8' }, // 차분한 파랑
  { fill: '#ece2fa', stroke: '#bfa8e6' }, // 라벤더
  { fill: '#dff5e6', stroke: '#85c69b' }, // 민트
  { fill: '#f5ebd8', stroke: '#d4b87a' }, // 모래
  { fill: '#f7d9e1', stroke: '#d28aa1' }, // 분홍
  { fill: '#d8eef5', stroke: '#7eb6c9' }, // 옅은 청록
  { fill: '#f5e0d8', stroke: '#cf9b85' }, // 살구
];
function pickCategoryPalette(name: string): { fill: string; stroke: string } {
  if (!name) return CATEGORY_FALLBACK_PALETTE[0];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_FALLBACK_PALETTE[h % CATEGORY_FALLBACK_PALETTE.length];
}
function categoryColors(name: string): { fill: string; stroke: string } {
  return CATEGORY_STYLE[name] ?? pickCategoryPalette(name);
}

function getAutoZoneName(zoneType: ZoneType, category: string | undefined): string {
  const normalized = normalizeCategoryForZoneType(zoneType, category);
  return ZONE_NAME_BY_CATEGORY[normalized] ?? `${normalized} 구역`;
}

function zoneCodeText(s: EditorShape): string {
  const code = String(s.data?.code ?? '').trim();
  return code || '—';
}

function zoneCategoryText(s: EditorShape): string {
  const zt = (s.data?.zone_type as ZoneType) ?? 'STORAGE';
  return normalizeCategoryForZoneType(zt, String(s.data?.category_major ?? ''));
}

function rotatePoint(originX: number, originY: number, localX: number, localY: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: originX + localX * cos - localY * sin,
    y: originY + localX * sin + localY * cos,
  };
}

/** 구역 편집 — 편집 툴 다크 */
const THEME = {
  bg: EDITOR_CANVAS_BG,
  selection: EDITOR_CYAN,
  text: '#5a6478',
  textBright: '#1e2a3a',
  panel: '#e8ecf2',
  panelBorder: '#d0d5de',
  panelInputBg: '#ffffff',
  toolbar: '#e8ecf2',
};

/** 선택 강조 */
const CANVAS_SEL_STROKE = EDITOR_CYAN;

const ZONE_CORNER_RADIUS = 8;
const ZONE_LAYOUT_COLOR: Record<ZoneType, string> = { ...EDITOR_ZONE_FILL };
const ZONE_HOVER_BORDER: Record<ZoneType, string> = {
  STORAGE: '#90CDF4',
  INBOUND: '#7cb489',
  OUTBOUND: '#F6E05E',
  DEFECT: '#FEB2B2',
};
const CATEGORY_STYLE: Record<string, { fill: string; stroke: string }> = {
  전자기기: { fill: '#dce6f5', stroke: '#a8bcd8' },
  가전제품: { fill: '#ece2fa', stroke: '#bfa8e6' },
  생활용품: { fill: '#dce6f5', stroke: '#a8bcd8' },
  입고존: { fill: '#dcf5e4', stroke: '#7cb489' },
  출고존: { fill: '#f5e8cc', stroke: '#d4aa60' },
  // 기존 저장 데이터 호환용 별칭
  입고장: { fill: '#dcf5e4', stroke: '#7cb489' },
  출고장: { fill: '#f5e8cc', stroke: '#d4aa60' },
  불량존: { fill: '#fdeaea', stroke: '#e57373' },
};
const GRID_SIZE = 10;
const SNAP_THRESHOLD = 12;
const ROT_SNAP = 15; // degrees
const ZONE_MIN_DRAW = 80;
const GRID_SNAP_PULL = 14;

type EditorMode = 'select' | 'zone';
type ShapeKind = 'zone';

interface EditorShape {
  id: string; kind: ShapeKind;
  x: number; y: number; width: number; height: number; rotation: number;
  label: string; stroke: string; fill: string; opacity: number;
  data?: Record<string, unknown>;
}

function snapGrid(v: number) { return Math.round(v / GRID_SIZE) * GRID_SIZE; }
function snapRot(deg: number) { return Math.round(deg / ROT_SNAP) * ROT_SNAP; }

function calcSnapPos(moving: EditorShape, others: EditorShape[]): { sx: number | null; sy: number | null } {
  let sx: number | null = null;
  let sy: number | null = null;
  const mR = moving.x + moving.width;
  const mB = moving.y + moving.height;
  const mCx = moving.x + moving.width / 2;
  const mCy = moving.y + moving.height / 2;
  for (const o of others) {
    if (o.id === moving.id || o.kind !== 'zone') continue;
    const oR = o.x + o.width;
    const oB = o.y + o.height;
    const oCx = o.x + o.width / 2;
    const oCy = o.y + o.height / 2;
    for (const [m, oo] of [[moving.x, o.x], [moving.x, oR], [mR, o.x], [mR, oR], [mCx, oCx]]) {
      if (Math.abs(m - oo) < SNAP_THRESHOLD) sx = oo - (m - moving.x);
    }
    for (const [m, oo] of [[moving.y, o.y], [moving.y, oB], [mB, o.y], [mB, oB], [mCy, oCy]]) {
      if (Math.abs(m - oo) < SNAP_THRESHOLD) sy = oo - (m - moving.y);
    }
  }
  return { sx, sy };
}

interface LayoutEditTabProps {
  warehouseId: string;
  onZoneDrillDown?: (zoneId: string) => void;
  /** 읽기 전용 — 편집 도구 숨김, 드래그 비활성 */
  readonly?: boolean;
  /** 하이라이트할 zone_id 집합 — 해당 존에 pulse 효과 */
  highlightZoneIds?: Set<string>;
}

export default function LayoutEditTab({ warehouseId, onZoneDrillDown, readonly = false, highlightZoneIds }: LayoutEditTabProps) {
  const { message } = App.useApp();
  const qc = useQueryClient();

  // 하이라이트 pulse 애니메이션
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!highlightZoneIds || highlightZoneIds.size === 0) return;
    const t = window.setInterval(() => setPulse((p) => p + 1), 400);
    return () => window.clearInterval(t);
  }, [highlightZoneIds]);
  const { data: canvas } = useWarehouseCanvas(warehouseId);
  const { data: zonesAll = [] } = useZonesByWarehouse(warehouseId);
  // 운영 중인 구역만 — 비활성은 구역 관리 탭에서 활성화 후 다시 진입
  const zones = useMemo(() => zonesAll.filter((z) => z.is_active !== false), [zonesAll]);
  const { data: productCategories = [] } = useProductCategoryRoots();
  const { data: zoneLayouts = [] } = useZoneLayouts(warehouseId);
  const { containerRef, size: cSize } = useContainerSize({ useBoundingRectHeight: true });
  const cW = canvas?.canvas_width ?? 1000; const cH = canvas?.canvas_height ?? 700;

  const [mode, setMode] = useState<EditorMode>('select');
  const [shapes, setShapes] = useState<EditorShape[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Ctrl+C/V 클립보드 — 선택한 구역 shape 의 크기/타입/라벨을 복사해 다음 Ctrl+V 시 새 shape 추가 */
  const [zoneClipboard, setZoneClipboard] = useState<EditorShape | null>(null);
  const [scale, setScale] = useState(0.7);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const historyRef = useRef<EditorShape[][]>([]);
  const histIdxRef = useRef(0);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [copiedSize, setCopiedSize] = useState<{ w: number; h: number } | null>(null);
  const [rotTooltip, setRotTooltip] = useState<{ x: number; y: number; deg: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ vx: number[]; hy: number[] } | null>(null);
  const [dragLive, setDragLive] = useState<{ id: string; x: number; y: number; w: number; h: number } | null>(null);
  const loadedZoneIdsRef = useRef<Set<string>>(new Set());
  const canvasPanRef = useRef<{ sx: number; sy: number; cx: number; cy: number; moved: boolean } | null>(null);
  const didCanvasPanMoveRef = useRef(false);
  const [canvasPanning, setCanvasPanning] = useState(false);
  const spaceDownRef = useRef(false);
  const [spacePanArm, setSpacePanArm] = useState(false);
  const editorPointerInsideRef = useRef(false);
  const stagePosRef = useRef(stagePos);
  stagePosRef.current = stagePos;
  const stageRef = useRef<Konva.Stage>(null);

  const trRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Map<string, Konva.Rect>>(new Map());
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;
  const selected = selectedId ? shapes.find((s) => s.id === selectedId) : null;

  useEffect(() => {
    setDragLive(null);
  }, [selectedId]);
  const multiSelected = selectedIds.size > 1 ? shapes.filter((s) => selectedIds.has(s.id)) : [];

  const contentBounds = useMemo((): WorldContentBounds => {
    if (shapes.length === 0) {
      return { minX: 0, minY: 0, maxX: cW, maxY: cH };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    shapes.forEach((s) => {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.width);
      maxY = Math.max(maxY, s.y + s.height);
    });
    return { minX, minY, maxX, maxY };
  }, [cW, cH, shapes]);

  const { worldW, worldH } = useMemo(() => {
    const maxR = Math.max(contentBounds.maxX + 160, cW * 1.1, 640);
    const maxB = Math.max(contentBounds.maxY + 160, cH * 1.1, 480);
    return { worldW: Math.ceil(maxR), worldH: Math.ceil(maxB) };
  }, [contentBounds, cW, cH]);

  // ── Fit to screen: 구역이 화면 중앙에 시원하게 (~90% 뷰포트 활용) ──
  const fitToScreen = useCallback(() => {
    if (cSize.width < 100 || cSize.height < 100) return;
    const v = fitWorldBoundsToViewport(cSize.width, cSize.height, contentBounds, {
      maxScale: 8,
      contentRatio: EDITOR_FIT_CONTENT_RATIO,
      paddingWorld: 4,
    });
    setScale(v.scale);
    setStagePos({ x: v.ox, y: v.oy });
  }, [cSize.width, cSize.height, contentBounds]);

  // ── Load shapes (구역·통로·출입구 전부 편집 가능) ──
  useEffect(() => {
    const s: EditorShape[] = [];
    shapeRefs.current.clear();
    loadedZoneIdsRef.current = new Set(zoneLayouts.map((zl) => zl.zone_id));
    zoneLayouts.forEach((zl, index) => {
      const z = zones.find((zz) => zz.id === zl.zone_id); const zt = z?.zone_type ?? 'STORAGE';
      const cat = normalizeCategoryForZoneType(zt, z?.category_major ?? '전자기기');
      const byCategory = CATEGORY_STYLE[cat];
      const shapeId = zl.id ? `zone-layout-${zl.id}` : `zone-${zl.zone_id}-${index}`;
      s.push({ id: shapeId, kind: 'zone', x: zl.pos_x, y: zl.pos_y, width: zl.width, height: zl.height, rotation: zl.rotation ?? 0, label: z?.name ?? '', fill: byCategory?.fill ?? EDITOR_ZONE_FILL[zt], stroke: byCategory?.stroke ?? EDITOR_ZONE_BORDER[zt], opacity: 1, data: { zone_id: zl.zone_id, code: z?.code, zone_type: zt, category_major: cat, category_id: z?.category_id ?? null } });
    });
    historyRef.current = [s];
    histIdxRef.current = 0;
    setShapes(s);
    setSelectedIds(new Set());
    setDrawStart(null);
    setDrawPreview(null);
    setSnapGuides(null);
    setDragLive(null);
    setRotTooltip(null);
    setHistTick((t) => t + 1);
    // 자동 fit 비활성 — 사용자가 직접 fit 하려면 우상단 "전체보기" 버튼을 사용한다.
  }, [zoneLayouts, zones]);

  useEffect(() => {
    const endPan = () => {
      if (canvasPanRef.current) setCanvasPanning(false);
      canvasPanRef.current = null;
    };
    window.addEventListener('mouseup', endPan);
    window.addEventListener('blur', endPan);
    return () => {
      window.removeEventListener('mouseup', endPan);
      window.removeEventListener('blur', endPan);
    };
  }, []);

  /* 캔버스 밖으로 커서가 나가도 팬이 끊기지 않도록 전역 이동 */
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const p = canvasPanRef.current;
      if (!p) return;
      const dx = e.clientX - p.cx;
      const dy = e.clientY - p.cy;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        p.moved = true;
        didCanvasPanMoveRef.current = true;
      }
      setStagePos({ x: p.sx + dx, y: p.sy + dy });
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  // 자동 fit 비활성 — 첫 로드/창고 전환/구역 생성 등 어떤 경우에도 자동 확대 안 함.
  // 사용자가 화면을 맞추려면 우상단 "전체보기" 버튼을 직접 누른다.

  // ── Pan: 우클릭·휠·Space+좌클릭 (스테이지 전역) ──
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onDown = (e: KonvaEventObject<MouseEvent>) => {
      if (mode !== 'select') return;
      const btn = e.evt.button;
      const isBlankCanvasTarget = e.target === stage || e.target.name() === 'world-hit-shell';
      const shouldStartPan =
        btn === 1 ||
        btn === 2 ||
        (btn === 0 && (spaceDownRef.current || isBlankCanvasTarget));
      if (shouldStartPan) {
        didCanvasPanMoveRef.current = false;
        canvasPanRef.current = {
          sx: stagePosRef.current.x,
          sy: stagePosRef.current.y,
          cx: e.evt.clientX,
          cy: e.evt.clientY,
          moved: false,
        };
        setCanvasPanning(true);
        if (btn === 2) e.evt.preventDefault();
      }
    };
    stage.on('mousedown', onDown);
    return () => {
      stage.off('mousedown', onDown);
    };
  }, [mode]);

  // ── Transformer ──
  useEffect(() => {
    if (!trRef.current) return;
    if (selectedIds.size > 0 && mode === 'select') {
      const nodes = [...selectedIds].map((id) => shapeRefs.current.get(id)).filter(Boolean) as Konva.Rect[];
      trRef.current.nodes(nodes); trRef.current.getLayer()?.batchDraw();
    } else trRef.current.nodes([]);
  }, [selectedIds, mode, shapes]);

  // ── Keyboard ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && editorPointerInsideRef.current) {
        e.preventDefault();
        if (!spaceDownRef.current) {
          spaceDownRef.current = true;
          setSpacePanArm(true);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
        setSpacePanArm(false);
      }
    };
    window.addEventListener('keydown', down, { capture: true });
    window.addEventListener('keyup', up, { capture: true });
    return () => {
      window.removeEventListener('keydown', down, { capture: true });
      window.removeEventListener('keyup', up, { capture: true });
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const inEditable =
        tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0 && mode === 'select' && !inEditable) {
        doDelete();
        return;
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); doRedo(); return; }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doUndo(); return; }

      // Ctrl+C — 선택된 구역 shape 의 크기/타입/라벨/카테고리 복사
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (inEditable) return;
        if (!selected || selected.kind !== 'zone') return;
        e.preventDefault();
        setZoneClipboard(selected);
        message.success(`구역 복사 (${Math.round(selected.width)} × ${Math.round(selected.height)})`);
        return;
      }

      // Ctrl+V — 복사된 구역과 동일한 크기/타입으로 새 shape 를 우측에 추가 (저장은 사용자가 [저장] 클릭)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        if (inEditable) return;
        if (!zoneClipboard) return;
        e.preventDefault();
        const gap = 20;
        const newId = `zone-${Date.now()}`;
        // 기준점: 복사 원본의 우측 + gap. 다른 zone 과 겹쳐도 괜찮음 (드래그로 옮길 수 있음)
        const ns: EditorShape = {
          ...zoneClipboard,
          id: newId,
          x: snapGrid(zoneClipboard.x + zoneClipboard.width + gap),
          y: snapGrid(zoneClipboard.y),
          // BE 의 createZone 호출 시 새 zone 으로 들어가게 zone_id 는 비움
          data: { ...(zoneClipboard.data ?? {}), zone_id: undefined, code: undefined },
        };
        push([...shapes, ns]);
        setSelectedIds(new Set([newId]));
        message.info('붙여넣기 — [저장] 누르면 새 구역으로 등록됩니다');
        return;
      }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });

  const push = useCallback((n: EditorShape[]) => {
    const sliced = historyRef.current.slice(0, histIdxRef.current + 1);
    sliced.push(n);
    historyRef.current = sliced.slice(-40);
    histIdxRef.current = historyRef.current.length - 1;
    setShapes(n);
    setHistTick((t) => t + 1);
  }, []);

  const doUndo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current -= 1;
    setShapes(historyRef.current[histIdxRef.current]);
    setSelectedIds(new Set());
    setHistTick((t) => t + 1);
  }, []);

  const doRedo = useCallback(() => {
    if (histIdxRef.current >= historyRef.current.length - 1) return;
    histIdxRef.current += 1;
    setShapes(historyRef.current[histIdxRef.current]);
    setSelectedIds(new Set());
    setHistTick((t) => t + 1);
  }, []);

  const doDelete = () => {
    const n = shapes.filter((s) => !selectedIds.has(s.id));
    push(n);
    setSelectedIds(new Set());
  };

  const upd = useCallback((id: string, p: Partial<EditorShape>) => {
    setShapes((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...p } : s));
      const sliced = historyRef.current.slice(0, histIdxRef.current + 1);
      sliced.push(next);
      historyRef.current = sliced.slice(-40);
      histIdxRef.current = historyRef.current.length - 1;
      return next;
    });
    setHistTick((t) => t + 1);
  }, []);

  const zIn = () => setScale((s) => Math.min(6, s * 1.15));
  const zOut = () => setScale((s) => Math.max(0.05, s / 1.15));
  // 휠 줌: 커서 포인트를 중심으로 월드좌표를 고정
  const onWh = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const st = e.target.getStage();
      const p = st?.getPointerPosition();
      if (!p) return;
      const delta = e.evt.deltaY > 0 ? 0.94 : 1.064;
      const ns = Math.max(0.05, Math.min(6, scale * delta));
      const wX = (p.x - stagePos.x) / scale;
      const wY = (p.y - stagePos.y) / scale;
      const nx = p.x - wX * ns;
      const ny = p.y - wY * ns;
      setStagePos({ x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 });
      setScale(ns);
    },
    [scale, stagePos.x, stagePos.y],
  );
  const gp = useCallback((e: KonvaEventObject<MouseEvent>) => { const p = e.target.getStage()?.getPointerPosition(); return p ? { x: (p.x - stagePos.x) / scale, y: (p.y - stagePos.y) / scale } : { x: 0, y: 0 }; }, [scale, stagePos]);

  // ── Mouse events ──
  const onMD = (e: KonvaEventObject<MouseEvent>) => {
    if (mode === 'select') return;
    setDrawStart(gp(e));
  };
  const onMM = (e: KonvaEventObject<MouseEvent>) => {
    if (canvasPanRef.current) return;
    if (!drawStart || mode === 'select') return;
    const p = gp(e);
    setDrawPreview({
      x: snapGrid(Math.min(drawStart.x, p.x)),
      y: snapGrid(Math.min(drawStart.y, p.y)),
      w: snapGrid(Math.abs(p.x - drawStart.x)),
      h: snapGrid(Math.abs(p.y - drawStart.y)),
    });
  };
  const onMU = () => {
    if (canvasPanRef.current) {
      canvasPanRef.current = null;
      setCanvasPanning(false);
    }
    if (!drawPreview) { setDrawStart(null); return; }
    const { x, y, w, h } = drawPreview;
    setDrawStart(null);
    setDrawPreview(null);
    // 기본: 구역
    if (w < ZONE_MIN_DRAW || h < ZONE_MIN_DRAW) return;
    const ns: EditorShape = {
      id: `zone-${Date.now()}`,
      kind: 'zone',
      x,
      y,
      width: w,
      height: h,
      rotation: 0,
      label: '전자기기 구역',
      fill: EDITOR_ZONE_FILL.STORAGE,
      stroke: EDITOR_ZONE_BORDER.STORAGE,
      opacity: 1,
      data: { zone_id: Date.now(), code: '', zone_type: 'STORAGE', category_major: '전자기기' },
    };
    const n = [...shapes, ns]; push(n); setSelectedIds(new Set([ns.id])); setMode('select');
  };

  // ── Click with Shift for multi-select ──
  const handleClick = (id: string, e: KonvaEventObject<MouseEvent>) => {
    if (readonly) return;
    if (mode !== 'select') return;
    const nativeEvt = e.evt;
    if (nativeEvt.shiftKey) {
      setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    } else {
      setSelectedIds(new Set([id]));
    }
  };

  // ── Drag: 격자·구역 테두리 스냅 + 가이드 ──
  const onDragMove = (id: string, e: KonvaEventObject<DragEvent>) => {
    const sh = shapes.find((s) => s.id === id);
    if (!sh) return;
    const node = e.target;

    let nx = node.x();
    let ny = node.y();
    const w = sh.width;
    const h = sh.height;

    const snapL = snapGrid(nx);
    if (Math.abs(nx - snapL) <= GRID_SNAP_PULL) nx = snapL;
    else {
      const snapR = snapGrid(nx + w) - w;
      if (Math.abs(nx - snapR) <= GRID_SNAP_PULL) nx = snapR;
    }
    const snapT = snapGrid(ny);
    if (Math.abs(ny - snapT) <= GRID_SNAP_PULL) ny = snapT;
    else {
      const snapB = snapGrid(ny + h) - h;
      if (Math.abs(ny - snapB) <= GRID_SNAP_PULL) ny = snapB;
    }

    node.x(nx);
    node.y(ny);

    const moving: EditorShape = { ...sh, x: nx, y: ny };
    const { sx, sy } = calcSnapPos(moving, shapes);
    if (sx !== null) node.x(sx);
    if (sy !== null) node.y(sy);

    const fx = node.x();
    const fy = node.y();
    const eps = 0.5;
    const vx: number[] = [];
    const hy: number[] = [];
    if (Math.abs(fx - snapGrid(fx)) < eps) vx.push(snapGrid(fx));
    if (Math.abs(fx + w - snapGrid(fx + w)) < eps) vx.push(snapGrid(fx + w));
    if (Math.abs(fy - snapGrid(fy)) < eps) hy.push(snapGrid(fy));
    if (Math.abs(fy + h - snapGrid(fy + h)) < eps) hy.push(snapGrid(fy + h));
    setSnapGuides(vx.length || hy.length ? { vx, hy } : null);
    if (id === selectedId) {
      setDragLive({ id, x: fx, y: fy, w: sh.width, h: sh.height });
    }
  };
  const onDragEnd = (id: string, e: KonvaEventObject<DragEvent>) => {
    setSnapGuides(null);
    setDragLive(null);
    const nx = e.target.x();
    const ny = e.target.y();
    upd(id, { x: snapGrid(nx), y: snapGrid(ny) });
  };

  // ── Transform end (resize + rotation) ──
  const onTE = (id: string) => {
    const n = shapeRefs.current.get(id); if (!n) return;
    const rot = snapRot(n.rotation());
    upd(id, { x: snapGrid(n.x()), y: snapGrid(n.y()), width: snapGrid(Math.max(ZONE_MIN_DRAW, n.width() * n.scaleX())), height: snapGrid(Math.max(ZONE_MIN_DRAW, n.height() * n.scaleY())), rotation: rot });
    n.scaleX(1); n.scaleY(1); n.rotation(rot);
    setRotTooltip(null);
  };

  // ── Transform during rotation → tooltip ──
  const onTransform = (_id: string, e: KonvaEventObject<Event>) => {
    const node = e.target;
    const stage = node.getStage(); if (!stage) return;
    const pos = stage.getPointerPosition();
    if (pos) setRotTooltip({ x: pos.x, y: pos.y - 30, deg: Math.round(node.rotation()) });
  };

  // ── Property panel ──
  const setProp = (f: 'x' | 'y' | 'width' | 'height' | 'rotation', v: number) => { if (selectedId) upd(selectedId, { [f]: f === 'rotation' ? v : snapGrid(v) }); };
  const setZoneType = (zt: ZoneType) => {
    if (!selectedId || !selected) return;
    const cat = normalizeCategoryForZoneType(zt, String(selected.data?.category_major ?? '전자기기'));
    const byCategory = CATEGORY_STYLE[cat];
    upd(
      selectedId,
      {
        label: getAutoZoneName(zt, cat),
        fill: byCategory?.fill ?? EDITOR_ZONE_FILL[zt],
        stroke: byCategory?.stroke ?? EDITOR_ZONE_BORDER[zt],
        data: {
          ...selected.data,
          zone_type: zt,
          category_major: cat,
          ...(zt === 'DEFECT' ? { category_id: null } : {}),
        },
      },
    );
  };
  const setZoneCategoryById = (categoryId: string | null) => {
    if (!selectedId || !selected) return;
    const zt = (selected.data?.zone_type as ZoneType) ?? 'STORAGE';
    const cat = productCategories.find((c) => c.id === categoryId);
    const name = cat?.name ?? '';
    const normalizedName = normalizeCategoryForZoneType(zt, name || '전자기기');
    const byCategory = CATEGORY_STYLE[normalizedName];
    upd(
      selectedId,
      {
        label: cat ? getAutoZoneName(zt, name) : selected.label,
        fill: byCategory?.fill ?? EDITOR_ZONE_FILL[zt],
        stroke: byCategory?.stroke ?? EDITOR_ZONE_BORDER[zt],
        data: { ...selected.data, category_id: categoryId, category_major: cat?.name ?? null },
      },
    );
  };
  const setLabel = (l: string) => { if (selectedId) upd(selectedId, { label: l }); };
  const copySize = () => { if (selected) { setCopiedSize({ w: selected.width, h: selected.height }); message.info('크기 복사'); } };
  const pasteSize = () => { if (selectedId && copiedSize) { upd(selectedId, { width: copiedSize.w, height: copiedSize.h }); message.success('붙여넣기'); } };

  // ── Multi-select alignment ──
  const alignH = () => { if (multiSelected.length < 2) return; const minY = Math.min(...multiSelected.map((s) => s.y)); const next = shapes.map((s) => selectedIds.has(s.id) ? { ...s, y: minY } : s); push(next); };
  const alignV = () => { if (multiSelected.length < 2) return; const minX = Math.min(...multiSelected.map((s) => s.x)); const next = shapes.map((s) => selectedIds.has(s.id) ? { ...s, x: minX } : s); push(next); };
  const sameSize = () => {
    if (multiSelected.length < 2) return;
    const first = multiSelected[0];
    const next = shapes.map((s) => selectedIds.has(s.id) ? { ...s, width: first.width, height: first.height } : s);
    push(next);
    message.success('크기 동일화');
  };

  // ── Save → API 저장 + 쿼리 무효화 (모니터·다른 탭에 반영) ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const zoneShapes = shapes.filter((s) => s.kind === 'zone');
      // shape → 실제 존재하는 zone_id 로 해석. s.data.zone_id 가 zones 에 매칭되면 기존,
      // 아니면(신규 도형은 Date.now() 숫자가 들어있음) null → 신규 생성 플로우로 진입.
      const resolveExistingZoneId = (s: typeof zoneShapes[number]): string | null => {
        const dataId = s.data?.zone_id != null ? String(s.data.zone_id) : '';
        if (!dataId) return null;
        const found = zones.find((zz) => zz.id === dataId && zz.warehouse_id === warehouseId);
        return found ? found.id : null;
      };
      const remainingZoneIds = new Set(
        zoneShapes
          .map(resolveExistingZoneId)
          .filter((id): id is string => !!id),
      );
      const deletedZoneIds = [...loadedZoneIdsRef.current].filter((zoneId) => !remainingZoneIds.has(zoneId));

      let working = [...zones];
      const zoneLayoutsPayload: ZoneLayout[] = [];

      for (const s of zoneShapes) {
        const existingZoneId = resolveExistingZoneId(s);
        let zoneId: string = existingZoneId ?? '';
        let z = existingZoneId
          ? working.find((zz) => zz.id === existingZoneId && zz.warehouse_id === warehouseId)
          : undefined;

        const shapeCategoryId = (s.data?.category_id as string | null | undefined) ?? null;
        if (!z) {
          const created = await warehouseApi.createZone({
            warehouse_id: warehouseId,
            code: String(s.data?.code ?? '').trim() || `Z-${Date.now()}`,
            name: s.label || '새 구역',
            zone_type: (s.data?.zone_type as ZoneType) || 'STORAGE',
            category_id: shapeCategoryId,
            sort_order: working.filter((x) => x.warehouse_id === warehouseId).length,
          });
          working = [...working, created];
          zoneId = created.id;
          z = created;
        } else {
          const code = String(s.data?.code ?? '').trim();
          await warehouseApi.updateZone(zoneId, {
            name: s.label,
            zone_type: (s.data?.zone_type as ZoneType) ?? z.zone_type,
            category_id: shapeCategoryId,
            ...(code ? { code } : {}),
          });
          const nextZ = {
            ...z,
            name: s.label,
            zone_type: (s.data?.zone_type as ZoneType) ?? z.zone_type,
            category_id: shapeCategoryId,
            ...(code ? { code } : {}),
          };
          const idx = working.findIndex((zz) => zz.id === zoneId);
          if (idx >= 0) working[idx] = nextZ;
          z = nextZ;
        }

        const zt = (s.data?.zone_type as ZoneType) ?? z.zone_type;
        zoneLayoutsPayload.push({
          zone_id: zoneId,
          warehouse_id: warehouseId,
          pos_x: Math.round(s.x),
          pos_y: Math.round(s.y),
          width: Math.round(s.width),
          height: Math.round(s.height),
          rotation: Math.round(s.rotation ?? 0),
          color: ZONE_LAYOUT_COLOR[zt] ?? '#FFFFFF',
        });
      }

      for (const zoneId of deletedZoneIds) {
        await warehouseApi.deactivateZone(zoneId);
      }

      await warehouseApi.saveZoneLayouts(warehouseId, zoneLayoutsPayload, deletedZoneIds);

      await qc.invalidateQueries({ queryKey: ['zones', warehouseId] });
      await qc.invalidateQueries({ queryKey: ['zone-layouts', warehouseId] });
      // zone 위치/크기가 바뀌면 모니터링·미니맵의 랙 월드 좌표가 재계산되어야 함
      await qc.invalidateQueries({ queryKey: ['rack-layouts-warehouse', warehouseId] });

      setSelectedIds(new Set());
      setDrawStart(null);
      setDrawPreview(null);
      setSnapGuides(null);
      setDragLive(null);
      setRotTooltip(null);
      trRef.current?.nodes([]);
      trRef.current?.getLayer()?.batchDraw();

      const json = shapes.map((s) => ({
        id: s.id, kind: s.kind, x: Math.round(s.x), y: Math.round(s.y),
        width: Math.round(s.width), height: Math.round(s.height), rotation: s.rotation,
        label: s.label, zone_type: s.data?.zone_type ?? null,
        direction: s.data?.direction ?? null, code: s.data?.code ?? null,
      }));
      console.log('[레이아웃 저장 JSON]', JSON.stringify(json, null, 2));
      message.success('레이아웃이 저장되었습니다. 모니터·구역 관리에 반영됩니다.');
    } catch (e) {
      console.error(e);
      message.error('저장에 실패했습니다. 콘솔을 확인하세요.');
    } finally {
      setSaving(false);
    }
  };

  const zonS = useMemo(() => shapes.filter((s) => s.kind === 'zone'), [shapes]);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const isSel = (id: string) => selectedIds.has(id);
  const tb = (on: boolean) => ({
    background: on ? 'rgba(239,159,39,0.12)' : '#ffffff',
    borderColor: on ? 'rgba(239,159,39,0.6)' : '#c8cdd6',
    color: on ? '#BA7517' : '#5a6478',
  });
  const zoneMetrics =
    selected?.kind === 'zone'
      ? dragLive && dragLive.id === selected.id
        ? dragLive
        : { x: selected.x, y: selected.y, w: selected.width, h: selected.height }
      : null;

  // ── Shared Rect props ──
  const sharedRect = (s: EditorShape) => ({
    ref: (n: Konva.Rect | null) => {
      if (n) shapeRefs.current.set(s.id, n);
      else shapeRefs.current.delete(s.id);
    },
    x: s.x, y: s.y, width: s.width, height: s.height, rotation: s.rotation,
    draggable: mode === 'select' && !spacePanArm && !readonly,
    onClick: (e: KonvaEventObject<MouseEvent>) => handleClick(s.id, e),
    onDblClick: (e: KonvaEventObject<MouseEvent>) => {
      if (s.kind !== 'zone' || !onZoneDrillDown) return;
      e.cancelBubble = true;
      // shape.id 는 내부 임시 id — 실제 zone_id 는 data.zone_id 또는 저장된 zone.id
      const zoneId = (s.data?.zone_id as string | undefined) ?? s.id;
      onZoneDrillDown(zoneId);
    },
    onDragMove: (e: KonvaEventObject<DragEvent>) => onDragMove(s.id, e),
    onDragEnd: (e: KonvaEventObject<DragEvent>) => onDragEnd(s.id, e),
    onTransformEnd: () => onTE(s.id),
    onTransform: (e: KonvaEventObject<Event>) => onTransform(s.id, e),
    onMouseEnter: () => { if (s.kind === 'zone') setHoveredZoneId(s.id); },
    onMouseLeave: () => { if (s.kind === 'zone') setHoveredZoneId((prev) => (prev === s.id ? null : prev)); },
  });

  const [histTick, setHistTick] = useState(0);
  void histTick;
  const canUndo = histIdxRef.current > 0;
  const canRedo = histIdxRef.current < historyRef.current.length - 1;

  return (
    <div
      className="rack-layout-editor-dark warehouse-editor-zone-tab-root"
      style={{
        display: 'flex',
        gap: 0,
        borderRadius: 8,
        overflow: 'hidden',
        background: '#f0f3f8',
        flex: 1,
        minHeight: 0,
        height: '100%',
        width: '100%',
      }}
    >
      {/* ── 좌측: 도구 + 속성 (240px) — readonly 시 숨김 ── */}
      {!readonly && <div
        className="rack-layout-editor-dark__aside warehouse-editor-aside-flat"
        style={{
          width: 240,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${THEME.panelBorder}`, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#8a94a6', marginBottom: 8, letterSpacing: '0.07em', textTransform: 'uppercase' }}>캔버스 도구</div>
          <Space wrap size={4}>
            <Tooltip title="선택"><Button size="small" style={tb(mode === 'select')} icon={<SelectOutlined />} onClick={() => setMode('select')} /></Tooltip>
            <Tooltip title="구역"><Button size="small" style={tb(mode === 'zone')} icon={<EditOutlined />} onClick={() => setMode('zone')} /></Tooltip>
          </Space>
          <div style={{ height: 1, background: THEME.panelBorder, margin: '10px 0' }} />
          <Space wrap size={4}>
            <Tooltip title="줌인"><Button size="small" style={tb(false)} icon={<ZoomInOutlined />} onClick={zIn} /></Tooltip>
            <Tooltip title="줌아웃"><Button size="small" style={tb(false)} icon={<ZoomOutOutlined />} onClick={zOut} /></Tooltip>
            <Tooltip title="전체보기"><Button size="small" style={tb(false)} icon={<ExpandOutlined />} onClick={fitToScreen} /></Tooltip>
          </Space>
          <div style={{ height: 1, background: THEME.panelBorder, margin: '10px 0' }} />
          <Space wrap size={4}>
            <Tooltip title="실행 취소 (Ctrl+Z)"><Button size="small" style={tb(false)} icon={<UndoOutlined />} onClick={doUndo} disabled={!canUndo} /></Tooltip>
            <Tooltip title="다시 실행 (Ctrl+Shift+Z)"><Button size="small" style={tb(false)} icon={<RedoOutlined />} onClick={doRedo} disabled={!canRedo} /></Tooltip>
            <Tooltip title="삭제 (Del)"><Button size="small" danger disabled={selectedIds.size === 0} icon={<DeleteOutlined />} onClick={doDelete} /></Tooltip>
          </Space>
          <Button
            size="small"
            type="primary"
            className="layout-edit-btn-save"
            block
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => void handleSave()}
            style={{ marginTop: 10 }}
          >
            저장
          </Button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, color: THEME.textBright, minHeight: 0 }}>
          <div className="warehouse-editor-side-heading">속성</div>
          {selectedIds.size === 0 && <div style={{ color: THEME.text, fontSize: 14, lineHeight: 1.75 }}>도형을 선택하거나<br />그려서 추가하세요<br /><span style={{ fontSize: 12 }}>Shift+클릭: 다중선택</span></div>}
          {multiSelected.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: THEME.text, marginBottom: 6 }}>{multiSelected.length}개 선택됨</div>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Button size="small" block icon={<AlignLeftOutlined />} style={{ borderColor: THEME.panelBorder, color: THEME.text }} onClick={alignH}>가로 정렬 (상단 맞춤)</Button>
                <Button size="small" block icon={<AlignCenterOutlined />} style={{ borderColor: THEME.panelBorder, color: THEME.text }} onClick={alignV}>세로 정렬 (좌측 맞춤)</Button>
                <Button size="small" block icon={<CopyOutlined />} style={{ borderColor: THEME.panelBorder, color: THEME.text }} onClick={sameSize}>크기 동일하게</Button>
              </Space>
              <div style={{ height: 1, background: THEME.panelBorder, margin: '12px 0' }} />
              <Button size="small" danger block onClick={doDelete} icon={<DeleteOutlined />}>선택 삭제 ({multiSelected.length})</Button>
            </div>
          )}
          {selected && (
            <>
              <div style={{ fontSize: 10, color: THEME.text, marginBottom: 4 }}>위치</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                <div><span style={{ fontSize: 9, color: THEME.text }}>X</span><InputNumber size="small" value={Math.round(selected.x)} onChange={(v) => setProp('x', v ?? 0)} style={{ width: '100%' }} /></div>
                <div><span style={{ fontSize: 9, color: THEME.text }}>Y</span><InputNumber size="small" value={Math.round(selected.y)} onChange={(v) => setProp('y', v ?? 0)} style={{ width: '100%' }} /></div>
              </div>
              <div style={{ fontSize: 10, color: THEME.text, marginBottom: 4 }}>크기</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                <div><span style={{ fontSize: 9, color: THEME.text }}>W</span><InputNumber size="small" value={Math.round(selected.width)} min={ZONE_MIN_DRAW} onChange={(v) => setProp('width', v ?? ZONE_MIN_DRAW)} style={{ width: '100%' }} /></div>
                <div><span style={{ fontSize: 9, color: THEME.text }}>H</span><InputNumber size="small" value={Math.round(selected.height)} min={ZONE_MIN_DRAW} onChange={(v) => setProp('height', v ?? ZONE_MIN_DRAW)} style={{ width: '100%' }} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                <div><span style={{ fontSize: 9, color: THEME.text }}>R (회전)</span><InputNumber size="small" value={selected.rotation} step={15} onChange={(v) => setProp('rotation', v ?? 0)} style={{ width: '100%' }} addonAfter="°" /></div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                  <Tooltip title="크기 복사"><Button size="small" icon={<CopyOutlined />} style={{ borderColor: THEME.panelBorder, color: THEME.text }} onClick={copySize} /></Tooltip>
                  {copiedSize && <Button size="small" style={{ borderColor: THEME.panelBorder, color: THEME.text, fontSize: 10 }} onClick={pasteSize}>붙여넣기</Button>}
                </div>
              </div>
              <div style={{ height: 1, background: THEME.panelBorder, margin: '0 0 10px' }} />
              {selected.kind === 'zone' && (<>
                <div style={{ fontSize: 10, color: THEME.text, marginBottom: 4 }}>
                  구역코드 <span style={{ color: '#94a3b8', fontSize: 9 }}>(자동 생성 · 수정 불가)</span>
                </div>
                <input
                  value={String(selected.data?.code ?? '')}
                  readOnly
                  placeholder="저장 시 자동 생성 (예: ZN-SEL-ELC-001)"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${THEME.panelBorder}`, borderRadius: 6, padding: '8px 10px', color: selected.data?.code ? THEME.textBright : '#64748b', fontSize: 13, marginBottom: 8, outline: 'none', fontFamily: 'monospace', cursor: 'not-allowed' }}
                />
                <div style={{ fontSize: 10, color: THEME.text, marginBottom: 4 }}>구역명</div>
                <input value={selected.label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 전자기기 구역" style={{ width: '100%', background: THEME.panelInputBg, border: `1px solid ${THEME.panelBorder}`, borderRadius: 6, padding: '8px 10px', color: THEME.textBright, fontSize: 14, marginBottom: 10, outline: 'none' }} />
                <div style={{ fontSize: 10, color: THEME.text, marginBottom: 4 }}>카테고리</div>
                <select
                  value={(selected.data?.category_id as string | null) ?? ''}
                  onChange={(e) => setZoneCategoryById(e.target.value || null)}
                  disabled={((selected.data?.zone_type as ZoneType) ?? 'STORAGE') !== 'STORAGE'}
                  style={{ width: '100%', background: THEME.panelInputBg, border: `1px solid ${THEME.panelBorder}`, borderRadius: 6, padding: '8px 10px', color: THEME.textBright, fontSize: 13, marginBottom: 10, outline: 'none' }}
                >
                  <option value="">
                    {((selected.data?.zone_type as ZoneType) ?? 'STORAGE') === 'STORAGE'
                      ? (productCategories.length === 0 ? '등록된 카테고리 없음 (선택 안 함)' : '카테고리 선택 (선택 안 함)')
                      : '구역유형에서 자동설정'}
                  </option>
                  {productCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <div style={{ fontSize: 10, color: THEME.text, marginBottom: 4 }}>구역유형</div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  {Object.entries(ZONE_TYPE_LABEL).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setZoneType(k as ZoneType)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, cursor: 'pointer', background: selected.data?.zone_type === k ? EDITOR_ZONE_CHIP_ACTIVE[k as ZoneType] : 'transparent', border: `1.5px solid ${EDITOR_ZONE_BORDER[k as ZoneType]}`, color: EDITOR_ZONE_BORDER[k as ZoneType], fontWeight: selected.data?.zone_type === k ? 700 : 400 }}>{label}</button>
                  ))}
                </div>
              </>)}
              <div style={{ height: 1, background: THEME.panelBorder, margin: '10px 0' }} />
              <Button size="small" danger block onClick={doDelete} icon={<DeleteOutlined />}>삭제</Button>
            </>
          )}
        </div>
        <div
          className="warehouse-editor-aside-live-metrics"
          style={{
            flexShrink: 0,
            padding: '10px 12px',
            borderTop: `1px solid ${THEME.panelBorder}`,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 11,
            color: THEME.textBright,
            letterSpacing: '0.02em',
          }}
        >
          {zoneMetrics ? (
            <>
              <span style={{ color: 'rgba(139, 233, 253, 0.85)', fontWeight: 600, marginRight: 8 }}>선택 구역</span>
              X <strong>{Math.round(zoneMetrics.x)}</strong>
              <span style={{ color: THEME.text, margin: '0 6px' }}>·</span>
              Y <strong>{Math.round(zoneMetrics.y)}</strong>
              <span style={{ color: THEME.text, margin: '0 6px' }}>·</span>
              W <strong>{Math.round(zoneMetrics.w)}</strong>
              <span style={{ color: THEME.text, margin: '0 6px' }}>·</span>
              H <strong>{Math.round(zoneMetrics.h)}</strong>
            </>
          ) : (
            <span style={{ color: THEME.text }}>구역 선택 시 좌표·크기 표시</span>
          )}
        </div>
      </div>}

      {/* ── 우측: 메인 캔버스 ── */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: EDITOR_CANVAS_BG }}>
        <div
          ref={containerRef}
          className="warehouse-editor-canvas-host rack-layout-editor-dark__canvas-shell"
          onMouseEnter={() => { editorPointerInsideRef.current = true; }}
          onMouseLeave={() => { editorPointerInsideRef.current = false; }}
          style={{
            cursor:
              mode !== 'select'
                ? 'crosshair'
                : canvasPanning
                  ? 'grabbing'
                  : spacePanArm
                    ? 'grab'
                    : 'grab',
            flex: 1,
            minHeight: 0,
            border: 'none',
            position: 'relative',
          }}
        >
          <Stage
            ref={stageRef}
            width={cSize.width}
            height={cSize.height}
            onMouseDown={onMD}
            onMouseMove={onMM}
            onMouseUp={onMU}
            onWheel={onWh}
            onContextMenu={(e) => e.evt.preventDefault()}
          >
            <Layer listening={false}>
              <EditorInfiniteGridScreen
                width={cSize.width}
                height={cSize.height}
                panX={stagePos.x}
                panY={stagePos.y}
                scale={scale}
                majorWorld={CAD_MAJOR_WORLD}
                minorWorld={0}
              />
            </Layer>
            <Layer>
              <Group x={stagePos.x} y={stagePos.y} scaleX={scale} scaleY={scale}>
                <Rect
                  name="world-hit-shell"
                  width={worldW}
                  height={worldH}
                  fill="rgba(0,0,0,0.001)"
                  listening
                  onMouseDown={(e) => {
                    if (mode !== 'select' || e.evt.button !== 0 || spaceDownRef.current) return;
                    didCanvasPanMoveRef.current = false;
                    canvasPanRef.current = {
                      sx: stagePosRef.current.x,
                      sy: stagePosRef.current.y,
                      cx: e.evt.clientX,
                      cy: e.evt.clientY,
                      moved: false,
                    };
                    setCanvasPanning(true);
                  }}
                  onClick={(e) => {
                    if (mode !== 'select' || e.evt.shiftKey) return;
                    if (didCanvasPanMoveRef.current) return;
                    setSelectedIds(new Set());
                  }}
                />
                {zonS.map((s) => {
                  const zt = (s.data?.zone_type as ZoneType) ?? 'STORAGE';
                  const isSelected = isSel(s.id);
                  const isHovered = hoveredZoneId === s.id;
                  const categoryMajor = String(s.data?.category_major ?? '');
                  const catPalette = categoryColors(categoryMajor);
                  const baseFill = zt === 'STORAGE' ? catPalette.fill : EDITOR_ZONE_FILL[zt];
                  const baseStroke = zt === 'STORAGE' ? catPalette.stroke : EDITOR_ZONE_BORDER[zt];
                  const selectedFill = EDITOR_ZONE_FILL_SELECTED[zt];
                  const titleFill = '#1e2a3a';
                  const subFill = '#7a8a9a';
                  const isHighlighted = !!(highlightZoneIds?.has(s.data?.zone_id as string));
                  const rotation = s.rotation ?? 0;
                  const titleY = Math.max(14, s.height / 2 - 22);
                  const subY = Math.max(14, s.height / 2 + 18);
                  const titlePos = rotatePoint(s.x, s.y, 0, titleY, rotation);
                  const subPos = rotatePoint(s.x, s.y, 0, subY, rotation);
                  const readableTitleSize = Math.min(Math.max(18 / Math.max(scale, 0.15), 18), Math.max(18, s.height * 0.32));
                  const readableSubSize = Math.min(Math.max(12 / Math.max(scale, 0.15), 12), Math.max(12, s.height * 0.2));
                  const showSubLabel = s.height * scale >= 34;
                  return (
                    <Group key={s.id}>
                      <Rect
                        {...sharedRect(s)}
                        fill={isSelected ? selectedFill : baseFill}
                        stroke={isHighlighted ? '#38bdf8' : isSelected ? CANVAS_SEL_STROKE : (isHovered ? ZONE_HOVER_BORDER[zt] : baseStroke)}
                        strokeWidth={isHighlighted ? (3 + (pulse % 3) * 0.5) : isSelected ? 2 : EDITOR_ZONE_STROKE_PX}
                        cornerRadius={ZONE_CORNER_RADIUS}
                        lineJoin="miter"
                        listening
                        shadowColor={isHighlighted ? '#38bdf8' : undefined}
                        shadowBlur={isHighlighted ? (12 + (pulse % 4) * 4) : 0}
                        shadowOpacity={isHighlighted ? 0.9 : 0}
                      />
                      <KonvaText
                        text={zoneCategoryText(s)}
                        x={titlePos.x}
                        y={titlePos.y}
                        rotation={rotation}
                        width={s.width}
                        align="center"
                        fontSize={readableTitleSize}
                        fontStyle="bold"
                        fontFamily="'IBM Plex Sans', 'Pretendard', ui-sans-serif, sans-serif"
                        fill={titleFill}
                        ellipsis
                        listening={false}
                      />
                      {showSubLabel && (
                        <KonvaText
                          text={`${zoneCodeText(s)} · ${(s.label || '이름 없음').trim()}`}
                          x={subPos.x}
                          y={subPos.y}
                          rotation={rotation}
                          width={s.width}
                          align="center"
                          fontSize={readableSubSize}
                          fontStyle="normal"
                          fill={subFill}
                          listening={false}
                        />
                      )}
                    </Group>
                  );
                })}
                {snapGuides && (
                  <>
                    {snapGuides.vx.map((vx, i) => (
                      <Line
                        key={`snap-v-${i}-${vx}`}
                        points={[vx, -1e5, vx, 1e5]}
                        stroke={EDITOR_CYAN}
                        strokeWidth={Math.max(0.55, 0.85 / scale)}
                        lineCap="square"
                        listening={false}
                      />
                    ))}
                    {snapGuides.hy.map((hy, i) => (
                      <Line
                        key={`snap-h-${i}-${hy}`}
                        points={[-1e5, hy, 1e5, hy]}
                        stroke={EDITOR_CYAN}
                        strokeWidth={Math.max(0.55, 0.85 / scale)}
                        lineCap="square"
                        listening={false}
                      />
                    ))}
                  </>
                )}
                {drawPreview && (
                  <Rect
                    x={drawPreview.x}
                    y={drawPreview.y}
                    width={drawPreview.w}
                    height={drawPreview.h}
                    fill="rgba(239, 159, 39, 0.12)"
                    stroke={EDITOR_CYAN}
                    strokeWidth={1.5}
                    cornerRadius={4}
                  />
                )}
                {mode === 'select' && (
                  <Transformer
                    ref={trRef}
                    rotateEnabled={!spacePanArm}
                    rotationSnaps={Array.from({ length: 24 }, (_, i) => i * 15)}
                    keepRatio={false}
                    borderEnabled={false}
                    anchorFill={EDITOR_CYAN}
                    anchorStroke="rgba(255,255,255,0.25)"
                    anchorSize={7}
                    boundBoxFunc={(_oldBox, newBox) => ({
                      x: snapGrid(newBox.x),
                      y: snapGrid(newBox.y),
                      width: Math.max(ZONE_MIN_DRAW, snapGrid(newBox.width)),
                      height: Math.max(ZONE_MIN_DRAW, snapGrid(newBox.height)),
                      rotation: newBox.rotation,
                    })}
                  />
                )}
              </Group>
            </Layer>
          </Stage>
          {/* Rotation tooltip */}
          {rotTooltip && <div style={{ position: 'absolute', left: rotTooltip.x, top: rotTooltip.y, background: THEME.panelInputBg, color: THEME.textBright, border: `1px solid ${THEME.panelBorder}`, padding: '4px 10px', borderRadius: 4, fontSize: 13, fontWeight: 700, pointerEvents: 'none', transform: 'translate(-50%,-100%)' }}>{rotTooltip.deg}°</div>}
          {/* Status bar */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, padding: '0 14px', boxSizing: 'border-box', background: '#e8ecf2', borderTop: '1px solid #d0d5de', color: '#5a6478', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              {mode === 'zone'
                ? '드래그: 새 구역 (최소 80px)'
                : `선택 ${selectedIds.size}개 · 빈 곳 좌드래그 / 우클릭·휠클릭 드래그 / Space+드래그: 팬 · 휠: 줌 · Shift+클릭: 다중`}
            </span>
            <span>줌 {Math.round(scale * 100)}% · 스냅 {GRID_SIZE}px (격자 {CAD_MAJOR_WORLD}px) · 회전 {ROT_SNAP}°</span>
          </div>
        </div>
      </div>
    </div>
  );
}
