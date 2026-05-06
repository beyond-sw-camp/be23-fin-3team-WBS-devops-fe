import { useState, useEffect } from 'react';
import { Rect, Shape } from 'react-konva';
import {
  EDITOR_CANVAS_BG,
  CAD_MAJOR_WORLD,
  EDITOR_GRID_STROKE,
  EDITOR_GRID_STROKE_MAJOR,
} from '@/pages/warehouse/warehouseEditorCanvasShared';

export type EditorInfiniteGridScreenProps = {
  width: number;
  height: number;
  panX: number;
  panY: number;
  scale: number;
  /** 월드 단위 메이저 스텝(기본 50px) */
  majorWorld?: number;
  /** 지정 시 메이저보다 얇은 실선 마이너 격자 추가 */
  minorWorld?: number;
  background?: string;
};

/**
 * 배경 위 얇은 메이저 가이드만(마이너 생략) — 번잡함 최소화.
 * 월드 콘텐츠(랙·구역)는 항상 별도 상위 Layer에 두어 격자 아래에 깔릴 것.
 */
export function EditorInfiniteGridScreen({
  width,
  height,
  panX,
  panY,
  scale,
  majorWorld = CAD_MAJOR_WORLD,
  minorWorld,
  background = EDITOR_CANVAS_BG,
}: EditorInfiniteGridScreenProps) {
  const [inner, setInner] = useState(() =>
    typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : { w: 1920, h: 1080 },
  );
  useEffect(() => {
    const sync = () => setInner({ w: window.innerWidth, h: window.innerHeight });
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const cw = Math.min(width, inner.w);
  const ch = Math.min(height, inner.h);
  const s = Math.max(0.025, scale);
  const pad = 600;
  const wx0 = (-panX) / s - pad;
  const wx1 = (cw - panX) / s + pad;
  const wy0 = (-panY) / s - pad;
  const wy1 = (ch - panY) / s + pad;

  return (
    <>
      <Rect x={0} y={0} width={width} height={height} fill={background} listening={false} />
      <Shape
        listening={false}
        perfectDrawEnabled={false}
        sceneFunc={(ctx) => {
          ctx.save();
          ctx.setLineDash([]);

          const xStartMajor = Math.floor(wx0 / majorWorld) * majorWorld;
          const yStartMajor = Math.floor(wy0 / majorWorld) * majorWorld;

          const hairMajor = Math.max(0.45, Math.min(0.65, 0.55 / s));
          const hairMinor = Math.max(0.28, Math.min(0.42, 0.38 / s));
          const minor = minorWorld ?? 0;

          if (minor > 0 && minor < majorWorld) {
            const x0m = Math.floor(wx0 / minor) * minor;
            const y0m = Math.floor(wy0 / minor) * minor;
            ctx.strokeStyle = EDITOR_GRID_STROKE;
            ctx.lineWidth = hairMinor;
            const onMajorX = (wx: number) => Math.abs(wx / majorWorld - Math.round(wx / majorWorld)) < 1e-6;
            const onMajorY = (wy: number) => Math.abs(wy / majorWorld - Math.round(wy / majorWorld)) < 1e-6;
            for (let wx = x0m; wx <= wx1; wx += minor) {
              if (onMajorX(wx)) continue;
              const sx = wx * s + panX;
              if (sx < -1 || sx > cw + 1) continue;
              ctx.beginPath();
              ctx.moveTo(sx, 0);
              ctx.lineTo(sx, ch);
              ctx.stroke();
            }
            for (let wy = y0m; wy <= wy1; wy += minor) {
              if (onMajorY(wy)) continue;
              const sy = wy * s + panY;
              if (sy < -1 || sy > ch + 1) continue;
              ctx.beginPath();
              ctx.moveTo(0, sy);
              ctx.lineTo(cw, sy);
              ctx.stroke();
            }
          }

          ctx.strokeStyle = EDITOR_GRID_STROKE_MAJOR;
          ctx.lineWidth = hairMajor;
          for (let wx = xStartMajor; wx <= wx1; wx += majorWorld) {
            const sx = wx * s + panX;
            if (sx < -1 || sx > cw + 1) continue;
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, ch);
            ctx.stroke();
          }
          for (let wy = yStartMajor; wy <= wy1; wy += majorWorld) {
            const sy = wy * s + panY;
            if (sy < -1 || sy > ch + 1) continue;
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(cw, sy);
            ctx.stroke();
          }

          ctx.restore();
        }}
      />
    </>
  );
}
