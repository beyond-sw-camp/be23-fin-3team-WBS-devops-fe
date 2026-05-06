import type { ZoneType } from '@/types/warehouse';

/** 레이아웃 허브 캔버스 바닥 — 불투명 다크 네이비 */
export const EDITOR_CANVAS_BG = '#f0f3f8';

/** 구역 면 (Figma/Linear 스타일 다크 카드) */
export const EDITOR_ZONE_FILL: Record<ZoneType, string> = {
  STORAGE: '#dce6f5',
  INBOUND: '#dcf5e4',
  OUTBOUND: '#fef3e0',
  DEFECT: '#fdeaea',
};

/** 선택 시 살짝 밝은 면 (~10%) */
export const EDITOR_ZONE_FILL_SELECTED: Record<ZoneType, string> = {
  STORAGE: '#f5ead0',
  INBOUND: '#f5ead0',
  OUTBOUND: '#f5ead0',
  DEFECT: '#fde2e2',
};

/** 구역 테두리 */
export const EDITOR_ZONE_BORDER: Record<ZoneType, string> = {
  STORAGE: '#a8bcd8',
  INBOUND: '#7cb489',
  OUTBOUND: '#d4aa60',
  DEFECT: '#e57373',
};

/** 레이아웃 탭 등에서 구역 Rect strokeWidth 권장값(px) */
export const EDITOR_ZONE_STROKE_PX = 1.5;

/** 속성 패널 칩·하이라이트 */
export const EDITOR_ZONE_CHIP_ACTIVE: Record<ZoneType, string> = {
  STORAGE: '#dce6f5',
  INBOUND: '#dcf5e4',
  OUTBOUND: '#fef3e0',
  DEFECT: '#fdeaea',
};

/** UI·선택·포커스 액센트 (amber) */
export const EDITOR_CYAN = '#EF9F27';
export const EDITOR_CYAN_DIM = 'rgba(239,159,39,0.5)';

/** 격자 — 다크 캔버스 24px 메이저 가이드 */
export const EDITOR_GRID_STROKE = 'rgba(0,21,41,0.05)';
export const EDITOR_GRID_STROKE_MAJOR = 'rgba(0,21,41,0.07)';

/** 구역 제목 / 서브(코드) Konva 텍스트 */
export const EDITOR_ZONE_TITLE = '#1e2a3a';
export const EDITOR_ZONE_LABEL_MUTED = '#8a9ab0';
export const EDITOR_GRID_STEP = 24;

/** 레거시/문서용 — 실제 높이는 MainLayout·flex 호스트가 결정 */
export const EDITOR_CANVAS_HEIGHT_CSS = '100%';

/** 스냅(랙·구역 배치): 10px · 시각 격자 메이저: 24px */
export const CAD_MINOR_WORLD = 10;
export const CAD_MAJOR_WORLD = 24;

/** Zoom-to-fit — 초기·전체보기 시 구역이 뷰포트에 시원하게 들어오도록 */
export const EDITOR_FIT_CONTENT_RATIO = 0.97;

/** 랙 편집 탭: 랙 묶음이 가시 영역(푸터 제외)의 대부분을 채우도록 맞출 때 사용 */
export const EDITOR_RACK_TAB_FIT_RATIO = 0.94;

/** 하단 범례 등 오버레이로 가려지는 높이 — fit 계산 시 스테이지 유효 높이에서 차감 */
export const EDITOR_RACK_TAB_FOOTER_RESERVE_PX = 48;

/** 랙 탭 «구역 상세» 한 구역만 맞출 때 — 과확대(스크롤) 방지 */
export const EDITOR_ZONE_DETAIL_MAX_SCALE = 1.08;

export type EditorViewportFit = { scale: number; ox: number; oy: number };

/** 월드 좌표에서 실제 도형이 차지하는 영역 (격자용 월드 크기와 별개) */
export type WorldContentBounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * 실제 콘텐츠 바운딩만 뷰포트의 `contentRatio` 안에 들어가게 스케일하고,
 * 그 바운딩의 중심을 스테이지 중앙에 올린다.
 */
export function fitWorldBoundsToViewport(
  stageW: number,
  stageH: number,
  bounds: WorldContentBounds,
  options?: {
    contentRatio?: number;
    minScale?: number;
    maxScale?: number;
    paddingWorld?: number;
  },
): EditorViewportFit {
  const contentRatio = options?.contentRatio ?? EDITOR_FIT_CONTENT_RATIO;
  const minScale = options?.minScale ?? 0.05;
  const maxScale = options?.maxScale ?? 8;
  const pad = options?.paddingWorld ?? 12;
  if (stageW < 60 || stageH < 60) {
    return { scale: 1, ox: 0, oy: 0 };
  }
  const minX = bounds.minX - pad;
  const minY = bounds.minY - pad;
  const maxX = bounds.maxX + pad;
  const maxY = bounds.maxY + pad;
  const bw = Math.max(maxX - minX, 100);
  const bh = Math.max(maxY - minY, 80);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const availW = stageW * contentRatio;
  const availH = stageH * contentRatio;
  const s = Math.max(minScale, Math.min(maxScale, Math.min(availW / bw, availH / bh)));
  return { scale: s, ox: stageW / 2 - cx * s, oy: stageH / 2 - cy * s };
}

export function fitWorldToViewport(
  stageW: number,
  stageH: number,
  worldW: number,
  worldH: number,
  options?: {
    contentRatio?: number;
    minScale?: number;
    maxScale?: number;
  },
): EditorViewportFit {
  const contentRatio = options?.contentRatio ?? EDITOR_FIT_CONTENT_RATIO;
  const minScale = options?.minScale ?? 0.05;
  const maxScale = options?.maxScale ?? 8;
  if (stageW < 60 || stageH < 60) {
    return { scale: 1, ox: 0, oy: 0 };
  }
  const bw = Math.max(worldW, 120);
  const bh = Math.max(worldH, 80);
  const availW = stageW * contentRatio;
  const availH = stageH * contentRatio;
  const sx = availW / bw;
  const sy = availH / bh;
  const scale = Math.max(minScale, Math.min(maxScale, Math.min(sx, sy)));
  const ox = (stageW - bw * scale) / 2;
  const oy = (stageH - bh * scale) / 2;
  return { scale, ox, oy };
}

export function fitWorldRectToViewport(
  stageW: number,
  stageH: number,
  rect: { x: number; y: number; w: number; h: number },
  options?: { contentRatio?: number; minScale?: number; maxScale?: number },
): EditorViewportFit {
  const contentRatio = options?.contentRatio ?? EDITOR_FIT_CONTENT_RATIO;
  const minScale = options?.minScale ?? 0.05;
  const maxScale = options?.maxScale ?? 8;
  if (stageW < 60 || stageH < 60) {
    return { scale: 1, ox: 0, oy: 0 };
  }
  const zw = Math.max(rect.w, 40);
  const zh = Math.max(rect.h, 40);
  const availW = stageW * contentRatio;
  const availH = stageH * contentRatio;
  const s = Math.max(minScale, Math.min(maxScale, Math.min(availW / zw, availH / zh)));
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const ox = stageW / 2 - cx * s;
  const oy = stageH / 2 - cy * s;
  return { scale: s, ox, oy };
}

export const EDITOR_SNAP_PX = CAD_MINOR_WORLD;

export function snapToEditorGrid(v: number, step: number = EDITOR_SNAP_PX): number {
  return Math.round(v / step) * step;
}

export function pickAdaptiveCadGrid(stageScale: number): {
  minor: number;
  major: number;
  showMinor: boolean;
} {
  const s = Math.max(0.04, Math.min(stageScale, 16));
  let mult = 1;
  while (CAD_MINOR_WORLD * mult * s < 3.2 && mult < 256) mult *= 2;
  const minor = CAD_MINOR_WORLD * mult;
  const major = CAD_MAJOR_WORLD * mult;
  const showMinor = minor * s >= 2.0;
  return { minor, major, showMinor };
}

/**
 * 호환용: 다크 바탕에 가는 실선 격자 패턴(도트 아님).
 * 메이저는 EDITOR_GRID_STROKE_MAJOR, 마이너는 EDITOR_GRID_STROKE.
 */
export function renderCadGridToCanvas(
  w: number,
  h: number,
  stageScale: number,
): HTMLCanvasElement {
  const { major } = pickAdaptiveCadGrid(stageScale);
  const cw = Math.min(Math.max(1, Math.ceil(w)), 8192);
  const ch = Math.min(Math.max(1, Math.ceil(h)), 8192);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  ctx.fillStyle = EDITOR_CANVAS_BG;
  ctx.fillRect(0, 0, cw, ch);
  ctx.setLineDash([]);

  const hairMajor = Math.max(0.4, 0.55);

  ctx.strokeStyle = EDITOR_GRID_STROKE_MAJOR;
  ctx.lineWidth = hairMajor;
  for (let x = 0; x <= cw; x += major) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, ch);
    ctx.stroke();
  }
  for (let y = 0; y <= ch; y += major) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(cw, y + 0.5);
    ctx.stroke();
  }

  return c;
}

export function canvasAsKonvaPatternFill(canvas: HTMLCanvasElement): HTMLImageElement {
  return canvas as unknown as HTMLImageElement;
}

/** @deprecated 호환용 */
export function WarehouseEditorGuideGrid(_props: { width: number; height: number }) {
  return null;
}
