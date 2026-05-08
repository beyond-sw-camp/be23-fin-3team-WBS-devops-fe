import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, Typography, App } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { login as loginApi } from '@/api/auth';
import type { LoginRequest } from '@/types/user';
import '@/pages/auth/login.css';

const { Text } = Typography;

/** ctx.roundRect 대체 — TS/lib DOM·구형 브라우저에서 roundRect 미지원 시 오류 방지 */
function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

function WarehouseBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    /** 클로저 안에서 TS가 ref를 null로 넓히는 경우 방지 */
    const cvs: HTMLCanvasElement = canvas;
    const c2d: CanvasRenderingContext2D = ctx;

    let animId = 0;
    let tick = 0;

    const SHELF_COLOR = '#30363d';
    const BOX_COLORS = ['#1c4a2a', '#0e3a5a', '#3a2a0e', '#2a1c4a'];

    type Shelf = { x: number; w: number; levels: number };
    type BoxConfig = { sx: number; sw: number; bx: number; bw: number; bh: number; color: string; level: number };

    let shelves: Shelf[] = [];
    let shelfBoxes: BoxConfig[][] = [];

    function buildShelves() {
      const W = cvs.offsetWidth;
      shelves = [];
      shelfBoxes = [];
      let xx = 60;
      while (xx < W - 140 && shelves.length < 8) {
        const w = 150 + Math.floor(Math.random() * 40);
        const levels = 3;
        shelves.push({ x: xx, w, levels });
        xx += w + 60 + Math.floor(Math.random() * 30);
      }
      shelfBoxes = shelves.map((s) => {
        const boxes: BoxConfig[] = [];
        for (let lvl = 0; lvl < s.levels; lvl++) {
          let bx = s.x + 8;
          while (bx < s.x + s.w - 16) {
            const bw = 28 + Math.floor(Math.random() * 24);
            if (bx + bw > s.x + s.w - 8) break;
            boxes.push({
              sx: s.x,
              sw: s.w,
              bx,
              bw,
              bh: 44 + Math.floor(Math.random() * 14),
              color: BOX_COLORS[Math.floor(Math.random() * BOX_COLORS.length)],
              level: lvl,
            });
            bx += bw + 4;
          }
        }
        return boxes;
      });
    }

    type MovingBox = { x: number; y: number; w: number; h: number; color: string; speed: number; scanned: boolean };
    const movingBoxes: MovingBox[] = [
      { x: -50, y: 0, w: 36, h: 30, color: '#1c4a2a', speed: 1.2, scanned: false },
      { x: -260, y: 0, w: 32, h: 28, color: '#0e3a5a', speed: 1.0, scanned: false },
      { x: -480, y: 0, w: 40, h: 32, color: '#3a2a0e', speed: 1.4, scanned: false },
      { x: -720, y: 0, w: 30, h: 26, color: '#2a1c4a', speed: 1.1, scanned: false },
    ];

    type Forklift = { x: number; dir: 1 | -1; hasBox: boolean; speed: number; boxColor: string; pauseUntil: number };
    const forklifts: Forklift[] = [
      { x: 80, dir: 1, hasBox: true, speed: 0.5, boxColor: '#0e3a5a', pauseUntil: 0 },
      { x: 600, dir: -1, hasBox: false, speed: 0.6, boxColor: '#3a2a0e', pauseUntil: 0 },
    ];

    type AGV = { x: number; dir: 1 | -1; hasBox: boolean; speed: number; boxColor: string };
    const agvs: AGV[] = [
      { x: -120, dir: 1, hasBox: true, speed: 1.4, boxColor: '#1c4a2a' },
      { x: -480, dir: 1, hasBox: false, speed: 1.6, boxColor: '#2a1c4a' },
    ];

    type Facing = 'front' | 'back' | 'left' | 'right';

    /** 검수 작업자 — 정면/측면/후면 다양한 방향으로 클립보드 체크 */
    type Inspector = { anchorShelf: number; offsetX: number; facing: Facing };
    const inspectors: Inspector[] = [
      { anchorShelf: 0, offsetX: 30, facing: 'left' },   // 셀프 0 박스 향해 좌측 보기
      { anchorShelf: 3, offsetX: 30, facing: 'front' },  // 정면 보며 클립보드 체크
      { anchorShelf: 5, offsetX: 30, facing: 'back' },   // 등 보임 (셀프 향함)
    ];

    /** QR 스캔 작업자 — 좌/우 측면으로 박스 스캔 */
    type Scanner = { anchorShelf: number; offsetX: number; scanT: number; lastFlash: number; facing: Facing };
    const scanners: Scanner[] = [
      { anchorShelf: 1, offsetX: 28, scanT: 0, lastFlash: 0, facing: 'right' },
      { anchorShelf: 4, offsetX: 28, scanT: 0.5, lastFlash: 0, facing: 'left' },
    ];

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const { offsetWidth, offsetHeight } = cvs;
      if (offsetWidth < 1 || offsetHeight < 1) return;
      cvs.width = Math.floor(offsetWidth * dpr);
      cvs.height = Math.floor(offsetHeight * dpr);
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildShelves();
    }

    resize();
    window.addEventListener('resize', resize);

    /** 지게차 — 사람보다 크게 (폭 60, 높이 ~70px) */
    function drawForklift(x: number, y: number, dir: 1 | -1, hasBox: boolean, boxColor: string) {
      // 그림자
      c2d.fillStyle = 'rgba(0,0,0,0.45)';
      c2d.beginPath();
      c2d.ellipse(x + 30, y + 2, 42, 5, 0, 0, Math.PI * 2);
      c2d.fill();
      // 몸체 (노란색)
      c2d.fillStyle = '#d4a017';
      fillRoundRect(c2d, x, y - 32, 60, 22, 3);
      c2d.fillStyle = 'rgba(255,255,255,0.18)';
      c2d.fillRect(x, y - 32, 60, 4);
      c2d.fillStyle = '#1a1d22';
      c2d.fillRect(x, y - 18, 60, 2);
      // 운전석 캐빈
      c2d.fillStyle = '#1c2128';
      c2d.fillRect(x + 6, y - 56, 28, 24);
      // 캐빈 창문
      c2d.fillStyle = 'rgba(125,211,252,0.42)';
      c2d.fillRect(x + 9, y - 53, 22, 16);
      c2d.fillStyle = 'rgba(255,255,255,0.18)';
      c2d.fillRect(x + 9, y - 53, 5, 16);
      // 운전자 (캐빈 안 — 더 사람답게)
      c2d.fillStyle = '#fbbf24';   // 헬멧
      fillRoundRect(c2d, x + 17, y - 53, 8, 5, 2);
      c2d.fillStyle = 'rgba(255,255,255,0.4)';
      c2d.fillRect(x + 19, y - 52, 3, 1);
      c2d.fillStyle = '#e5b78a';   // 얼굴
      fillRoundRect(c2d, x + 17, y - 48, 8, 6, 2);
      // 운전자 눈
      c2d.fillStyle = '#0d1117';
      c2d.fillRect(x + 19, y - 46, 1, 1);
      c2d.fillRect(x + 22, y - 46, 1, 1);
      // 조끼
      c2d.fillStyle = '#22c55e';
      c2d.fillRect(x + 16, y - 42, 10, 8);
      c2d.fillStyle = 'rgba(255,255,255,0.4)';
      c2d.fillRect(x + 16, y - 39, 10, 1);
      // 캐빈 프레임
      c2d.strokeStyle = '#373e47';
      c2d.lineWidth = 1.5;
      c2d.strokeRect(x + 6, y - 56, 28, 24);
      // 마스트(포크 기둥)
      const mastX = dir > 0 ? x + 58 : x;
      c2d.fillStyle = '#373e47';
      c2d.fillRect(mastX, y - 70, 5, 60);
      // 마스트 슬라이더
      c2d.fillStyle = '#4a5562';
      c2d.fillRect(mastX - 1, y - 50, 7, 4);
      // 포크
      const forkOff = dir > 0 ? 5 : -28;
      c2d.fillStyle = '#6b7280';
      c2d.fillRect(mastX + forkOff, y - 22, 28, 4);
      c2d.fillRect(mastX + forkOff, y - 14, 28, 4);
      c2d.fillStyle = 'rgba(255,255,255,0.14)';
      c2d.fillRect(mastX + forkOff, y - 22, 28, 1);
      // 박스 (포크 위)
      if (hasBox) {
        c2d.fillStyle = boxColor;
        fillRoundRect(c2d, mastX + forkOff, y - 48, 28, 26, 2);
        c2d.fillStyle = 'rgba(255,255,255,0.14)';
        c2d.fillRect(mastX + forkOff, y - 48, 28, 3);
        c2d.fillStyle = 'rgba(255,255,255,0.06)';
        c2d.fillRect(mastX + forkOff, y - 48, 4, 26);
        // 라벨 라인
        c2d.fillStyle = 'rgba(0,0,0,0.3)';
        c2d.fillRect(mastX + forkOff + 6, y - 38, 16, 2);
        c2d.fillRect(mastX + forkOff + 6, y - 33, 16, 2);
      }
      // 바퀴 (큼)
      c2d.fillStyle = '#0d1117';
      c2d.beginPath();
      c2d.arc(x + 12, y - 8, 8, 0, Math.PI * 2);
      c2d.fill();
      c2d.beginPath();
      c2d.arc(x + 48, y - 8, 8, 0, Math.PI * 2);
      c2d.fill();
      // 휠 림
      c2d.fillStyle = '#374151';
      c2d.beginPath();
      c2d.arc(x + 12, y - 8, 3.5, 0, Math.PI * 2);
      c2d.fill();
      c2d.beginPath();
      c2d.arc(x + 48, y - 8, 3.5, 0, Math.PI * 2);
      c2d.fill();
      // 휠 허브
      c2d.fillStyle = '#9ca3af';
      c2d.fillRect(x + 11, y - 9, 2, 2);
      c2d.fillRect(x + 47, y - 9, 2, 2);
      // 라이트
      const blink = Math.floor(tick / 20) % 2;
      if (blink) {
        c2d.fillStyle = 'rgba(251,191,36,0.85)';
        const lightX = dir > 0 ? x + 60 : x - 3;
        c2d.fillRect(lightX, y - 28, 3, 4);
      }
    }

    /** 검수 작업자 — 정면/후면/좌측/우측 4방향 지원 (총 높이 ~68px) */
    function drawInspector(x: number, y: number, frame: number, facing: Facing) {
      const checkPhase = (Math.sin(frame * 0.05) + 1) / 2; // 0~1
      const armOff = checkPhase * 5;
      const headBob = Math.round(Math.sin(frame * 0.025) * 1);

      // 그림자
      c2d.fillStyle = 'rgba(0,0,0,0.4)';
      c2d.beginPath();
      c2d.ellipse(x, y + 2, 14, 3.5, 0, 0, Math.PI * 2);
      c2d.fill();

      if (facing === 'front' || facing === 'back') {
        // ── 다리 ──
        c2d.fillStyle = '#1f2937';
        c2d.fillRect(x - 6, y - 24, 4, 24);
        c2d.fillRect(x + 2, y - 24, 4, 24);
        c2d.fillStyle = 'rgba(0,0,0,0.32)';
        c2d.fillRect(x - 6, y - 13, 4, 1);
        c2d.fillRect(x + 2, y - 13, 4, 1);

        // ── 신발 ──
        c2d.fillStyle = '#0d1117';
        fillRoundRect(c2d, x - 7, y - 2, 6, 2, 1);
        fillRoundRect(c2d, x + 1, y - 2, 6, 2, 1);

        // ── 몸통 (형광 조끼) ──
        c2d.fillStyle = '#16a34a';
        fillRoundRect(c2d, x - 9, y - 48, 18, 24, 3);
        c2d.fillStyle = 'rgba(255,255,255,0.5)';
        c2d.fillRect(x - 9, y - 40, 18, 2);
        c2d.fillRect(x - 9, y - 32, 18, 2);
        c2d.fillStyle = 'rgba(0,0,0,0.22)';
        c2d.fillRect(x - 9, y - 48, 18, 1);

        if (facing === 'front') {
          // V넥
          c2d.fillStyle = '#1f2937';
          c2d.beginPath();
          c2d.moveTo(x - 3, y - 48);
          c2d.lineTo(x + 3, y - 48);
          c2d.lineTo(x, y - 44);
          c2d.closePath();
          c2d.fill();
        } else {
          // 등 중앙 솔기
          c2d.fillStyle = 'rgba(0,0,0,0.18)';
          c2d.fillRect(x, y - 48, 1, 24);
        }

        // ── 목 ──
        c2d.fillStyle = '#c89770';
        c2d.fillRect(x - 2, y - 51 + headBob, 4, 3);

        // ── 머리 ──
        c2d.fillStyle = '#e5b78a';
        fillRoundRect(c2d, x - 5, y - 62 + headBob, 11, 12, 5);
        if (facing === 'front') {
          // 눈
          c2d.fillStyle = '#0d1117';
          c2d.fillRect(x - 3, y - 56 + headBob, 1, 2);
          c2d.fillRect(x + 1, y - 56 + headBob, 1, 2);
          // 입
          c2d.fillStyle = 'rgba(0,0,0,0.35)';
          c2d.fillRect(x - 1, y - 52 + headBob, 2, 1);
        } else {
          // 뒷통수 음영
          c2d.fillStyle = 'rgba(0,0,0,0.24)';
          c2d.fillRect(x - 4, y - 60 + headBob, 9, 3);
          c2d.fillStyle = 'rgba(0,0,0,0.14)';
          c2d.fillRect(x - 4, y - 53 + headBob, 9, 1);
        }

        // ── 헬멧 ──
        c2d.fillStyle = '#fbbf24';
        fillRoundRect(c2d, x - 7, y - 68 + headBob, 14, 8, 5);
        if (facing === 'front') {
          c2d.fillRect(x - 8, y - 61 + headBob, 16, 2);
        } else {
          c2d.fillRect(x - 6, y - 61 + headBob, 12, 2);
        }
        c2d.fillStyle = 'rgba(255,255,255,0.4)';
        c2d.fillRect(x - 5, y - 67 + headBob, 6, 2);
        c2d.fillStyle = 'rgba(0,0,0,0.22)';
        if (facing === 'front') {
          c2d.fillRect(x - 8, y - 60 + headBob, 16, 1);
        } else {
          c2d.fillRect(x - 6, y - 60 + headBob, 12, 1);
        }

        // ── 양팔 ──
        c2d.fillStyle = '#16a34a';
        fillRoundRect(c2d, x - 13, y - 46, 4, 16, 2);

        if (facing === 'front') {
          // 오른팔 + 클립보드 (체크 모션)
          fillRoundRect(c2d, x + 9, y - 46 - armOff, 4, 14, 2);
          c2d.fillStyle = '#e5b78a';
          fillRoundRect(c2d, x - 12, y - 31, 3, 3, 1);
          fillRoundRect(c2d, x + 9, y - 33 - armOff, 3, 3, 1);
          c2d.fillStyle = '#dde3eb';
          fillRoundRect(c2d, x + 12, y - 38 - armOff, 14, 18, 1);
          c2d.fillStyle = '#9ca3af';
          c2d.fillRect(x + 16, y - 39 - armOff, 6, 2);
          c2d.fillRect(x + 14, y - 33 - armOff, 10, 1);
          c2d.fillRect(x + 14, y - 30 - armOff, 10, 1);
          c2d.fillRect(x + 14, y - 27 - armOff, 7, 1);
          if (checkPhase > 0.82) {
            c2d.fillStyle = '#22d3ee';
            c2d.font = 'bold 11px monospace';
            c2d.fillText('✓', x + 16, y - 22 - armOff);
          }
        } else {
          // 후면 — 양팔 자연스럽게
          fillRoundRect(c2d, x + 9, y - 46, 4, 16, 2);
          c2d.fillStyle = '#e5b78a';
          fillRoundRect(c2d, x - 12, y - 31, 3, 3, 1);
          fillRoundRect(c2d, x + 9, y - 31, 3, 3, 1);
          // 등에 클립보드 살짝 보임
          c2d.fillStyle = '#dde3eb';
          fillRoundRect(c2d, x - 7, y - 36, 14, 12, 1);
          c2d.fillStyle = '#9ca3af';
          c2d.fillRect(x - 3, y - 37, 6, 2);
        }
      } else {
        // ── 측면 ──
        const dir: 1 | -1 = facing === 'right' ? 1 : -1;

        // 뒷다리 (어둡게)
        c2d.fillStyle = '#1a232f';
        c2d.fillRect(x - 1 - dir * 2, y - 24, 3, 24);
        // 앞다리
        c2d.fillStyle = '#1f2937';
        c2d.fillRect(x - 2 + dir, y - 24, 4, 24);
        c2d.fillStyle = 'rgba(0,0,0,0.32)';
        c2d.fillRect(x - 2 + dir, y - 13, 4, 1);

        // 신발 (앞쪽으로)
        c2d.fillStyle = '#0d1117';
        fillRoundRect(c2d, dir > 0 ? x - 1 : x - 7, y - 2, 8, 2, 1);

        // 몸통 (좁은 옆모습)
        c2d.fillStyle = '#16a34a';
        fillRoundRect(c2d, x - 6, y - 48, 12, 24, 3);
        c2d.fillStyle = 'rgba(255,255,255,0.5)';
        c2d.fillRect(x - 6, y - 40, 12, 2);
        c2d.fillRect(x - 6, y - 32, 12, 2);
        c2d.fillStyle = 'rgba(0,0,0,0.22)';
        c2d.fillRect(x - 6, y - 48, 12, 1);
        // 옆구리 음영 (뒤쪽)
        c2d.fillStyle = 'rgba(0,0,0,0.18)';
        c2d.fillRect(dir > 0 ? x - 6 : x + 5, y - 48, 1, 24);

        // 목
        c2d.fillStyle = '#c89770';
        c2d.fillRect(x - 2, y - 51 + headBob, 4, 3);

        // 머리 (옆모습)
        c2d.fillStyle = '#e5b78a';
        fillRoundRect(c2d, x - 5, y - 62 + headBob, 10, 12, 5);
        // 코
        c2d.fillStyle = '#d4a574';
        c2d.fillRect(dir > 0 ? x + 5 : x - 6, y - 56 + headBob, 2, 2);
        // 한쪽 눈
        c2d.fillStyle = '#0d1117';
        c2d.fillRect(dir > 0 ? x + 2 : x - 2, y - 56 + headBob, 1, 2);
        // 입
        c2d.fillStyle = 'rgba(0,0,0,0.32)';
        c2d.fillRect(dir > 0 ? x + 2 : x - 3, y - 52 + headBob, 2, 1);
        // 귀 (반대편)
        c2d.fillStyle = '#d4a574';
        c2d.fillRect(dir > 0 ? x - 4 : x + 4, y - 56 + headBob, 1, 2);

        // 헬멧
        c2d.fillStyle = '#fbbf24';
        fillRoundRect(c2d, x - 6, y - 68 + headBob, 12, 8, 5);
        // 챙 (앞쪽으로 길게)
        c2d.fillRect(dir > 0 ? x - 6 : x - 10, y - 61 + headBob, 16, 2);
        c2d.fillStyle = 'rgba(255,255,255,0.4)';
        c2d.fillRect(dir > 0 ? x - 4 : x - 1, y - 67 + headBob, 5, 2);
        c2d.fillStyle = 'rgba(0,0,0,0.22)';
        c2d.fillRect(dir > 0 ? x - 6 : x - 10, y - 60 + headBob, 16, 1);

        // 한쪽 팔 + 클립보드 (앞쪽으로)
        c2d.fillStyle = '#16a34a';
        if (dir > 0) {
          fillRoundRect(c2d, x + 4, y - 46 - armOff, 4, 16, 2);
          c2d.fillStyle = '#e5b78a';
          fillRoundRect(c2d, x + 4, y - 31 - armOff, 3, 3, 1);
          c2d.fillStyle = '#dde3eb';
          fillRoundRect(c2d, x + 8, y - 38 - armOff, 14, 18, 1);
          c2d.fillStyle = '#9ca3af';
          c2d.fillRect(x + 12, y - 39 - armOff, 6, 2);
          c2d.fillRect(x + 10, y - 33 - armOff, 10, 1);
          c2d.fillRect(x + 10, y - 30 - armOff, 10, 1);
          c2d.fillRect(x + 10, y - 27 - armOff, 7, 1);
          if (checkPhase > 0.82) {
            c2d.fillStyle = '#22d3ee';
            c2d.font = 'bold 11px monospace';
            c2d.fillText('✓', x + 12, y - 22 - armOff);
          }
        } else {
          fillRoundRect(c2d, x - 8, y - 46 - armOff, 4, 16, 2);
          c2d.fillStyle = '#e5b78a';
          fillRoundRect(c2d, x - 7, y - 31 - armOff, 3, 3, 1);
          c2d.fillStyle = '#dde3eb';
          fillRoundRect(c2d, x - 22, y - 38 - armOff, 14, 18, 1);
          c2d.fillStyle = '#9ca3af';
          c2d.fillRect(x - 18, y - 39 - armOff, 6, 2);
          c2d.fillRect(x - 20, y - 33 - armOff, 10, 1);
          c2d.fillRect(x - 20, y - 30 - armOff, 10, 1);
          c2d.fillRect(x - 20, y - 27 - armOff, 7, 1);
          if (checkPhase > 0.82) {
            c2d.fillStyle = '#22d3ee';
            c2d.font = 'bold 11px monospace';
            c2d.fillText('✓', x - 18, y - 22 - armOff);
          }
        }
      }
    }

    /** QR 스캔 작업자 — 좌/우 측면으로 박스 스캔 */
    function drawScanner(x: number, y: number, frame: number, facing: Facing, scanProgress: number, showFlash: boolean) {
      const headBob = Math.round(Math.sin(frame * 0.04) * 1);
      const dir: 1 | -1 = facing === 'left' ? -1 : 1;

      // 그림자
      c2d.fillStyle = 'rgba(0,0,0,0.4)';
      c2d.beginPath();
      c2d.ellipse(x, y + 2, 14, 3.5, 0, 0, Math.PI * 2);
      c2d.fill();

      // 다리 (옆모습)
      c2d.fillStyle = '#1a232f';
      c2d.fillRect(x - 1 - dir * 2, y - 24, 3, 24);
      c2d.fillStyle = '#1f2937';
      c2d.fillRect(x - 2 + dir, y - 24, 4, 24);
      c2d.fillStyle = 'rgba(0,0,0,0.32)';
      c2d.fillRect(x - 2 + dir, y - 13, 4, 1);

      // 신발
      c2d.fillStyle = '#0d1117';
      fillRoundRect(c2d, dir > 0 ? x - 1 : x - 7, y - 2, 8, 2, 1);

      // 몸통 (파란 작업복, 옆모습)
      c2d.fillStyle = '#2563eb';
      fillRoundRect(c2d, x - 6, y - 48, 12, 24, 3);
      c2d.fillStyle = 'rgba(255,255,255,0.16)';
      c2d.fillRect(x - 6, y - 47, 12, 1);
      c2d.fillStyle = 'rgba(0,0,0,0.2)';
      c2d.fillRect(x - 6, y - 48, 12, 1);
      c2d.fillStyle = 'rgba(0,0,0,0.18)';
      c2d.fillRect(dir > 0 ? x - 6 : x + 5, y - 48, 1, 24);
      // 가슴 포켓 (앞쪽)
      c2d.fillStyle = '#1e40af';
      c2d.fillRect(dir > 0 ? x + 1 : x - 5, y - 36, 4, 4);

      // 목
      c2d.fillStyle = '#c89770';
      c2d.fillRect(x - 2, y - 51 + headBob, 4, 3);

      // 머리 (옆모습)
      c2d.fillStyle = '#e5b78a';
      fillRoundRect(c2d, x - 5, y - 62 + headBob, 10, 12, 5);
      // 코
      c2d.fillStyle = '#d4a574';
      c2d.fillRect(dir > 0 ? x + 5 : x - 6, y - 56 + headBob, 2, 2);
      // 한쪽 눈 (집중)
      c2d.fillStyle = '#0d1117';
      c2d.fillRect(dir > 0 ? x + 2 : x - 2, y - 56 + headBob, 1, 2);
      // 입
      c2d.fillStyle = 'rgba(0,0,0,0.32)';
      c2d.fillRect(dir > 0 ? x + 2 : x - 3, y - 52 + headBob, 2, 1);
      // 귀 (반대편)
      c2d.fillStyle = '#d4a574';
      c2d.fillRect(dir > 0 ? x - 4 : x + 4, y - 56 + headBob, 1, 2);

      // 헬멧 (주황)
      c2d.fillStyle = '#f97316';
      fillRoundRect(c2d, x - 6, y - 68 + headBob, 12, 8, 5);
      c2d.fillRect(dir > 0 ? x - 6 : x - 10, y - 61 + headBob, 16, 2);
      c2d.fillStyle = 'rgba(255,255,255,0.4)';
      c2d.fillRect(dir > 0 ? x - 4 : x - 1, y - 67 + headBob, 5, 2);
      c2d.fillStyle = 'rgba(0,0,0,0.22)';
      c2d.fillRect(dir > 0 ? x - 6 : x - 10, y - 60 + headBob, 16, 1);

      // 앞으로 뻗은 팔 + 핸드폰
      c2d.fillStyle = '#2563eb';
      const armX = dir > 0 ? x + 4 : x - 22;
      fillRoundRect(c2d, armX, y - 46, 18, 4, 2);
      c2d.fillStyle = '#e5b78a';
      c2d.fillRect(dir > 0 ? x + 21 : x - 24, y - 45, 3, 3);

      // 핸드폰
      const phoneX = dir > 0 ? x + 23 : x - 31;
      c2d.fillStyle = '#0d1117';
      fillRoundRect(c2d, phoneX, y - 51, 8, 14, 1);
      c2d.fillStyle = '#22d3ee';
      c2d.fillRect(phoneX + 1, y - 50, 6, 11);
      c2d.fillStyle = '#0d1117';
      c2d.beginPath();
      c2d.arc(phoneX + 4, y - 47, 1.2, 0, Math.PI * 2);
      c2d.fill();
      c2d.fillStyle = '#374151';
      c2d.fillRect(phoneX + 3, y - 39, 2, 1);

      // 스캔 빔
      const beamLen = 50;
      const beamAlpha = 0.4 + 0.45 * Math.abs(Math.sin(scanProgress * Math.PI * 2));
      if (dir > 0) {
        const beamStart = x + 31;
        const grad = c2d.createLinearGradient(beamStart, 0, beamStart + beamLen, 0);
        grad.addColorStop(0, `rgba(239, 68, 68, ${beamAlpha})`);
        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        c2d.fillStyle = grad;
        c2d.fillRect(beamStart, y - 45, beamLen, 2);
        c2d.fillStyle = `rgba(239, 68, 68, ${beamAlpha * 0.5})`;
        c2d.fillRect(beamStart, y - 47, beamLen * 0.6, 1);
        c2d.fillRect(beamStart, y - 42, beamLen * 0.6, 1);
        const targetX = beamStart + beamLen;
        c2d.fillStyle = `rgba(239, 68, 68, ${0.55 + 0.4 * Math.abs(Math.sin(scanProgress * Math.PI * 4))})`;
        c2d.fillRect(targetX - 2, y - 56, 2, 32);
        if (showFlash) {
          c2d.fillStyle = 'rgba(34, 197, 94, 0.95)';
          c2d.font = '600 10px monospace';
          c2d.textAlign = 'left';
          c2d.fillText('▸ SCANNED', x + 23, y - 60);
        }
      } else {
        const beamStart = x - 31;
        const grad = c2d.createLinearGradient(beamStart, 0, beamStart - beamLen, 0);
        grad.addColorStop(0, `rgba(239, 68, 68, ${beamAlpha})`);
        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        c2d.fillStyle = grad;
        c2d.fillRect(beamStart - beamLen, y - 45, beamLen, 2);
        c2d.fillStyle = `rgba(239, 68, 68, ${beamAlpha * 0.5})`;
        c2d.fillRect(beamStart - beamLen * 0.6, y - 47, beamLen * 0.6, 1);
        c2d.fillRect(beamStart - beamLen * 0.6, y - 42, beamLen * 0.6, 1);
        const targetX = beamStart - beamLen;
        c2d.fillStyle = `rgba(239, 68, 68, ${0.55 + 0.4 * Math.abs(Math.sin(scanProgress * Math.PI * 4))})`;
        c2d.fillRect(targetX, y - 56, 2, 32);
        if (showFlash) {
          c2d.fillStyle = 'rgba(34, 197, 94, 0.95)';
          c2d.font = '600 10px monospace';
          c2d.textAlign = 'right';
          c2d.fillText('SCANNED ◂', x - 23, y - 60);
          c2d.textAlign = 'left';
        }
      }
    }

    /** AGV — 자율주행 운반 로봇 (살짝 키움) */
    function drawAGV(x: number, y: number, hasBox: boolean, boxColor: string) {
      // 그림자
      c2d.fillStyle = 'rgba(0,0,0,0.35)';
      c2d.beginPath();
      c2d.ellipse(x + 18, y + 2, 22, 3, 0, 0, Math.PI * 2);
      c2d.fill();
      // 본체
      c2d.fillStyle = '#475569';
      fillRoundRect(c2d, x, y - 9, 36, 9, 2);
      c2d.fillStyle = 'rgba(255,255,255,0.18)';
      c2d.fillRect(x + 1, y - 9, 34, 1);
      c2d.fillStyle = '#334155';
      c2d.fillRect(x, y - 4, 36, 1);
      // 박스
      if (hasBox) {
        c2d.fillStyle = boxColor;
        fillRoundRect(c2d, x + 4, y - 23, 28, 14, 2);
        c2d.fillStyle = 'rgba(255,255,255,0.14)';
        c2d.fillRect(x + 4, y - 23, 28, 2);
        c2d.fillStyle = 'rgba(255,255,255,0.06)';
        c2d.fillRect(x + 4, y - 23, 2, 14);
      }
      // LED
      const blink = Math.floor(tick / 14) % 2;
      c2d.fillStyle = blink ? '#22c55e' : 'rgba(34,197,94,0.3)';
      c2d.fillRect(x + 1, y - 7, 3, 3);
      c2d.fillStyle = blink ? 'rgba(239,68,68,0.95)' : 'rgba(239,68,68,0.3)';
      c2d.fillRect(x + 32, y - 7, 3, 3);
      // 바퀴
      c2d.fillStyle = '#0d1117';
      c2d.fillRect(x + 3, y - 2, 6, 2);
      c2d.fillRect(x + 27, y - 2, 6, 2);
    }

    function draw() {
      const W = cvs.offsetWidth;
      const H = cvs.offsetHeight;
      if (W < 2 || H < 2) {
        animId = requestAnimationFrame(draw);
        return;
      }
      c2d.clearRect(0, 0, W, H);

      // 배경
      c2d.fillStyle = '#0d1117';
      c2d.fillRect(0, 0, W, H);

      // 격자 라인
      c2d.strokeStyle = 'rgba(56,189,248,0.04)';
      c2d.lineWidth = 0.5;
      for (let x = 0; x < W; x += 64) {
        c2d.beginPath();
        c2d.moveTo(x, 0);
        c2d.lineTo(x, H);
        c2d.stroke();
      }
      for (let y = 0; y < H; y += 64) {
        c2d.beginPath();
        c2d.moveTo(0, y);
        c2d.lineTo(W, y);
        c2d.stroke();
      }

      // AGV 통로 (선반 윗 영역)
      const agvLaneY = Math.max(110, H * 0.18);

      const floorY = H - 100;
      const conveyorY = floorY;

      // 바닥
      c2d.fillStyle = '#161b22';
      c2d.fillRect(0, floorY, W, H - floorY);
      c2d.strokeStyle = '#21262d';
      c2d.lineWidth = 1;
      c2d.beginPath();
      c2d.moveTo(0, floorY);
      c2d.lineTo(W, floorY);
      c2d.stroke();

      // 컨베이어
      c2d.fillStyle = '#1c2128';
      c2d.fillRect(0, conveyorY - 18, W, 18);
      c2d.strokeStyle = '#373e47';
      c2d.lineWidth = 1;
      c2d.beginPath();
      c2d.moveTo(0, conveyorY - 18);
      c2d.lineTo(W, conveyorY - 18);
      c2d.stroke();
      c2d.beginPath();
      c2d.moveTo(0, conveyorY);
      c2d.lineTo(W, conveyorY);
      c2d.stroke();

      const offset = (tick * 1.5) % 56;
      c2d.fillStyle = '#373e47';
      for (let x = -56 + offset; x < W; x += 56) {
        c2d.fillRect(x, conveyorY - 12, 36, 3);
      }

      // AGV 통로 가이드 라인 (점선)
      c2d.strokeStyle = 'rgba(99,153,34,0.18)';
      c2d.lineWidth = 1;
      c2d.setLineDash([6, 6]);
      c2d.beginPath();
      c2d.moveTo(0, agvLaneY);
      c2d.lineTo(W, agvLaneY);
      c2d.stroke();
      c2d.setLineDash([]);

      // 선반 + 박스
      shelves.forEach((s, si) => {
        const shelfH = (floorY - 40) * 0.85;
        const levelH = shelfH / s.levels;
        const shelfTop = floorY - shelfH;

        c2d.fillStyle = SHELF_COLOR;
        c2d.fillRect(s.x, shelfTop, 5, shelfH);
        c2d.fillRect(s.x + s.w - 5, shelfTop, 5, shelfH);

        for (let i = 1; i <= s.levels; i++) {
          const boardY = shelfTop + levelH * i;
          c2d.fillStyle = SHELF_COLOR;
          c2d.fillRect(s.x, boardY - 5, s.w, 5);
          c2d.fillStyle = 'rgba(255,255,255,0.04)';
          c2d.fillRect(s.x, boardY - 5, s.w, 1);
        }

        shelfBoxes[si].forEach((b) => {
          const boardY = shelfTop + levelH * (b.level + 1);
          const boxY = boardY - b.bh - 5;

          c2d.fillStyle = b.color;
          fillRoundRect(c2d, b.bx, boxY, b.bw, b.bh, 2);

          c2d.fillStyle = 'rgba(255,255,255,0.06)';
          c2d.fillRect(b.bx, boxY, b.bw, 2);
          c2d.fillStyle = 'rgba(255,255,255,0.04)';
          c2d.fillRect(b.bx, boxY, 2, b.bh);
        });

        c2d.fillStyle = 'rgba(99,153,34,0.35)';
        c2d.font = '9px monospace';
        c2d.textAlign = 'left';
        c2d.fillText(`${String.fromCharCode(65 + si)}-01`, s.x + s.w / 2 - 12, floorY - 8);
      });

      // 컨베이어 박스 + 스캔 플래시
      movingBoxes.forEach((b) => {
        b.x += b.speed;
        if (b.x > W + 60) {
          b.x = -60;
          b.scanned = false;
        }
        b.y = conveyorY - 18 - b.h;

        const alpha = b.x < 40 ? b.x / 40 : b.x > W - 40 ? (W - b.x) / 40 : 1;
        c2d.globalAlpha = Math.max(0, Math.min(1, alpha));
        c2d.fillStyle = b.color;
        fillRoundRect(c2d, b.x, b.y, b.w, b.h, 2);
        c2d.fillStyle = 'rgba(255,255,255,0.08)';
        c2d.fillRect(b.x, b.y, b.w, 2);

        // 컨베이어 중앙 통과 시 스캔 라인 (한 번)
        const scanZone = W * 0.5;
        if (!b.scanned && b.x + b.w / 2 > scanZone - 4 && b.x + b.w / 2 < scanZone + 4) {
          b.scanned = true;
        }
        if (b.scanned) {
          c2d.fillStyle = 'rgba(239,68,68,0.45)';
          c2d.fillRect(b.x + b.w / 2 - 1, b.y, 2, b.h);
        }
        c2d.globalAlpha = 1;
      });

      // 컨베이어 위 스캐너 게이트 (가운데)
      const gateX = W * 0.5;
      c2d.fillStyle = '#21262d';
      c2d.fillRect(gateX - 2, conveyorY - 60, 4, 42);
      c2d.fillRect(gateX - 14, conveyorY - 62, 28, 4);
      c2d.fillStyle = 'rgba(239,68,68,0.65)';
      c2d.fillRect(gateX - 12, conveyorY - 60, 24, 1);

      // 검수 작업자 그리기 (셀프 통로)
      inspectors.forEach((ins) => {
        const s = shelves[ins.anchorShelf];
        if (!s) return;
        const x = s.x + s.w + ins.offsetX;
        const y = floorY;
        drawInspector(x, y, tick, ins.facing);
      });

      // QR 스캔 작업자 그리기
      scanners.forEach((sc) => {
        const s = shelves[sc.anchorShelf];
        if (!s) return;
        const x = s.x + s.w + sc.offsetX;
        const y = floorY;
        sc.scanT += 0.012;
        if (sc.scanT > 1) sc.scanT = 0;
        const showFlash = sc.scanT > 0.4 && sc.scanT < 0.7;
        drawScanner(x, y, tick, sc.facing, sc.scanT, showFlash);
      });

      // 지게차 그리기 (바닥 영역에서 좌우 이동)
      forklifts.forEach((f) => {
        if (tick > f.pauseUntil) {
          f.x += f.speed * f.dir;
          if (f.dir > 0 && f.x > W + 40) {
            f.x = -40;
            f.hasBox = !f.hasBox;
            f.boxColor = BOX_COLORS[Math.floor(Math.random() * BOX_COLORS.length)];
          } else if (f.dir < 0 && f.x < -40) {
            f.x = W + 40;
            f.hasBox = !f.hasBox;
            f.boxColor = BOX_COLORS[Math.floor(Math.random() * BOX_COLORS.length)];
          }
        }
        drawForklift(f.x, floorY + 24, f.dir, f.hasBox, f.boxColor);
      });

      // AGV 그리기 (선반 위쪽 통로)
      agvs.forEach((a) => {
        a.x += a.speed * a.dir;
        if (a.x > W + 30) {
          a.x = -30;
          a.hasBox = Math.random() > 0.4;
          a.boxColor = BOX_COLORS[Math.floor(Math.random() * BOX_COLORS.length)];
        }
        drawAGV(a.x, agvLaneY, a.hasBox, a.boxColor);
      });

      // HUD — 좌상단
      c2d.fillStyle = 'rgba(99,153,34,0.6)';
      c2d.font = '500 11px monospace';
      c2d.textAlign = 'left';
      c2d.fillText('SYSTEM ONLINE', 20, 28);
      c2d.fillStyle = 'rgba(99,153,34,0.35)';
      c2d.font = '10px monospace';
      c2d.fillText('WMS v2.0  |  ZONE: MAIN FLOOR', 20, 44);

      // HUD — 우상단 (실시간 카운터 느낌)
      const baseItems = 1284;
      const baseOrders = 42;
      const itemsLive = baseItems + Math.floor(tick / 30) % 60;
      const ordersLive = baseOrders + Math.floor(tick / 240) % 12;
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      c2d.fillStyle = 'rgba(99,153,34,0.6)';
      c2d.font = '500 12px monospace';
      c2d.textAlign = 'right';
      c2d.fillText(timeStr, W - 20, 28);
      c2d.font = '10px monospace';
      c2d.fillStyle = 'rgba(99,153,34,0.35)';
      c2d.fillText(`ITEMS: ${itemsLive.toLocaleString()}  |  ORDERS: ${ordersLive}`, W - 20, 44);
      c2d.textAlign = 'left';

      // 스캐너 게이트 OK 메시지 (가끔 깜빡)
      const okBlink = Math.floor(tick / 60) % 2;
      if (okBlink) {
        c2d.fillStyle = 'rgba(34, 197, 94, 0.65)';
        c2d.font = '500 9px monospace';
        c2d.textAlign = 'center';
        c2d.fillText('SCAN OK', gateX, conveyorY - 66);
        c2d.textAlign = 'left';
      }

      // 스캔 라인 효과 (전체 화면 아래로 흐름)
      const scanY = (tick * 1.2) % H;
      c2d.strokeStyle = 'rgba(99,153,34,0.08)';
      c2d.lineWidth = 1;
      c2d.beginPath();
      c2d.moveTo(0, scanY);
      c2d.lineTo(W, scanY);
      c2d.stroke();

      tick++;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="login-wbs__canvas-bg"
      aria-hidden
    />
  );
}

type Phase = 'intro' | 'login';

export default function LoginPage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const storeLogin = useAuthStore((s) => s.login);
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  // 인트로 단계 — 키보드 (Space/Enter) 로도 진입 허용
  useEffect(() => {
    if (phase !== 'intro') return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        setPhase('login');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  const onFinish = async (values: LoginRequest) => {
    setLoading(true);
    try {
      const user = await loginApi(values);
      // 다른 회사 계정으로 갈아탔다면 옛 캐시 (warehouses 등) 비워야 함
      queryClient.clear();
      storeLogin(user);
      message.success(`${user.name}님 환영합니다.`);
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Login failed:', err);
      message.error('아이디 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wbs">

      <WarehouseBg />

      {phase === 'intro' && (
        <button
          type="button"
          className="login-wbs__intro"
          onClick={() => setPhase('login')}
          aria-label="시스템 접속"
        >
          <div className="login-wbs__intro-inner">
            <h1 className="login-wbs__intro-logo">WBS</h1>

            <div className="login-wbs__intro-tagline">지능형 스마트 창고관리 플랫폼</div>

            <div className="login-wbs__intro-divider" />

            <div className="login-wbs__intro-prompt">
              CLICK ANYWHERE TO ENTER
              <span className="login-wbs__intro-cursor">_</span>
            </div>
          </div>
        </button>
      )}

      {phase === 'login' && <div className="login-wbs__dim" aria-hidden />}

      {phase === 'login' && (
        <section className="login-wbs__panel login-wbs__panel--enter">
          <header className="login-wbs__brand">
            <h1 className="login-wbs__logo">WBS</h1>
            <span className="login-wbs__slogan">We Build Systems</span>
            <span className="login-wbs__tagline">엔터프라이즈 창고 관리 솔루션 · 신뢰할 수 있는 재고·레이아웃 운영</span>
          </header>

          <Card className="login-wbs__card" variant="borderless">
            <h2 className="login-wbs__card-title">시스템 로그인</h2>
            <Text className="login-wbs__card-sub">인증된 계정으로 접속하세요</Text>

            <Form layout="vertical" onFinish={onFinish} autoComplete="off" requiredMark={false}>
              <Form.Item<LoginRequest>
                label="아이디"
                name="loginId"
                rules={[{ required: true, message: '아이디를 입력하세요' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="아이디" size="large" />
              </Form.Item>

              <Form.Item<LoginRequest>
                label="비밀번호"
                name="password"
                rules={[
                  { required: true, message: '비밀번호를 입력하세요' },
                  { min: 6, message: '비밀번호는 6자 이상이어야 합니다' },
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="비밀번호" size="large" />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={loading}
                  className="login-wbs__submit"
                >
                  로그인
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <button
            type="button"
            className="login-wbs__back"
            onClick={() => setPhase('intro')}
          >
            ← 인트로 화면으로 돌아가기
          </button>
        </section>
      )}

    </div>
  );
}
