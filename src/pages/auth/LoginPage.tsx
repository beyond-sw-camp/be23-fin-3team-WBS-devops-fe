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

    const shelves = [
      { x: 60, w: 160, levels: 3 },
      { x: 270, w: 180, levels: 3 },
      { x: 500, w: 150, levels: 3 },
    ];

    type BoxConfig = { sx: number; sw: number; bx: number; bw: number; bh: number; color: string; level: number };
    const shelfBoxes: BoxConfig[][] = shelves.map((s) => {
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

    type MovingBox = { x: number; y: number; w: number; h: number; color: string; speed: number };
    const movingBoxes: MovingBox[] = [
      { x: -50, y: 0, w: 36, h: 30, color: '#1c4a2a', speed: 1.2 },
      { x: -200, y: 0, w: 32, h: 28, color: '#0e3a5a', speed: 1.0 },
      { x: -380, y: 0, w: 40, h: 32, color: '#3a2a0e', speed: 1.4 },
    ];

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const { offsetWidth, offsetHeight } = cvs;
      if (offsetWidth < 1 || offsetHeight < 1) return;
      cvs.width = Math.floor(offsetWidth * dpr);
      cvs.height = Math.floor(offsetHeight * dpr);
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener('resize', resize);

    function draw() {
      const W = cvs.offsetWidth;
      const H = cvs.offsetHeight;
      if (W < 2 || H < 2) {
        animId = requestAnimationFrame(draw);
        return;
      }
      c2d.clearRect(0, 0, W, H);

      c2d.fillStyle = '#0d1117';
      c2d.fillRect(0, 0, W, H);

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

      const floorY = H - 100;
      const conveyorY = floorY;

      c2d.fillStyle = '#161b22';
      c2d.fillRect(0, floorY, W, H - floorY);
      c2d.strokeStyle = '#21262d';
      c2d.lineWidth = 1;
      c2d.beginPath();
      c2d.moveTo(0, floorY);
      c2d.lineTo(W, floorY);
      c2d.stroke();

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

      movingBoxes.forEach((b) => {
        b.x += b.speed;
        if (b.x > W + 60) b.x = -60;
        b.y = conveyorY - 18 - b.h;

        const alpha = b.x < 40 ? b.x / 40 : b.x > W - 40 ? (W - b.x) / 40 : 1;
        c2d.globalAlpha = Math.max(0, Math.min(1, alpha));
        c2d.fillStyle = b.color;
        fillRoundRect(c2d, b.x, b.y, b.w, b.h, 2);
        c2d.fillStyle = 'rgba(255,255,255,0.08)';
        c2d.fillRect(b.x, b.y, b.w, 2);
        c2d.globalAlpha = 1;
      });

      c2d.fillStyle = 'rgba(99,153,34,0.6)';
      c2d.font = '500 11px monospace';
      c2d.textAlign = 'left';
      c2d.fillText('SYSTEM ONLINE', 20, 28);
      c2d.fillStyle = 'rgba(99,153,34,0.35)';
      c2d.font = '10px monospace';
      c2d.fillText('WMS v2.0  |  ZONE: MAIN FLOOR', 20, 44);

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      c2d.fillStyle = 'rgba(99,153,34,0.6)';
      c2d.font = '500 12px monospace';
      c2d.textAlign = 'right';
      c2d.fillText(timeStr, W - 20, 28);
      c2d.font = '10px monospace';
      c2d.fillStyle = 'rgba(99,153,34,0.35)';
      c2d.fillText('ITEMS: 1,284  |  ORDERS: 42', W - 20, 44);
      c2d.textAlign = 'left';

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

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const storeLogin = useAuthStore((s) => s.login);
  const queryClient = useQueryClient();
  const { message } = App.useApp();

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
      <section className="login-wbs__panel">
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

      </section>

    </div>
  );
}
