import { useEffect, useState } from 'react';
import { Tooltip, Button, App } from 'antd';
import { ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { refreshAccessToken } from '@/api/auth';

interface SessionTimes {
  iat: number;  // unix seconds
  exp: number;  // unix seconds
}

function decodeSessionTimes(): SessionTimes | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const claims = JSON.parse(atob(padded)) as { iat?: number; exp?: number };
    if (typeof claims.iat !== 'number' || typeof claims.exp !== 'number') return null;
    return { iat: claims.iat, exp: claims.exp };
  } catch {
    return null;
  }
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatElapsed(seconds: number): string {
  if (seconds <= 0) return '0분';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

/**
 * 헤더 세션 타이머.
 *  - 남은 시간 + 로그인/만료 시각 (Tooltip)
 *  - 5분 이하: 주황 / 1분 이하: 빨강 / 그 외: 회색
 *  - 매초 갱신. token 갱신 시 다른 탭에서는 storage 이벤트로 자동 재디코딩.
 *    같은 탭에서의 token 변경은 라우팅이 다시 마운트시키거나 페이지 새로고침으로 해결.
 */
export default function SessionTimer() {
  const { message } = App.useApp();
  const [times, setTimes] = useState<SessionTimes | null>(decodeSessionTimes);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    const tick = () => {
      setNow(Math.floor(Date.now() / 1000));
      // 매초 token 도 다시 읽음 — 같은 탭에서 token 갱신 시(연장/login)에도 반영
      const fresh = decodeSessionTimes();
      setTimes((prev) => (
        prev && fresh && prev.iat === fresh.iat && prev.exp === fresh.exp ? prev : fresh
      ));
    };
    const interval = setInterval(tick, 1000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'token') setTimes(decodeSessionTimes());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const handleExtend = async () => {
    if (extending) return;
    setExtending(true);
    try {
      await refreshAccessToken();
      // useEffect 의 매초 tick 이 다음 사이클에 새 token 을 자동 디코딩.
      // 즉시 반영을 위해 한 번 더 바로 갱신.
      setTimes(decodeSessionTimes());
      message.success('세션이 연장되었습니다.');
    } catch (err) {
      const msg = (err as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message
        ?? (err instanceof Error ? err.message : '세션 연장에 실패했습니다.');
      message.error(msg);
    } finally {
      setExtending(false);
    }
  };

  if (!times) return null;
  const remaining = times.exp - now;
  const elapsed = now - times.iat;
  const color = remaining <= 60 ? '#ef4444' : remaining <= 300 ? '#f59e0b' : '#64748b';
  const loginAt = dayjs.unix(times.iat).format('HH:mm');
  const expiresAt = dayjs.unix(times.exp).format('HH:mm');
  // 임박(5분 이하) 또는 만료(0초 이하)면 연장 버튼 노출
  const showExtend = remaining <= 300;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Tooltip
        title={(
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div>로그인 시각: {loginAt}</div>
            <div>세션 만료 시각: {expiresAt}</div>
            <div>로그인 후 경과: {formatElapsed(elapsed)}</div>
          </div>
        )}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            color,
            fontSize: 13,
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
            cursor: 'default',
          }}
        >
          <ClockCircleOutlined />
          {formatRemaining(remaining)}
        </span>
      </Tooltip>
      {showExtend && (
        <Tooltip title="세션을 30분 연장합니다">
          <Button
            size="small"
            type={remaining <= 60 ? 'primary' : 'default'}
            danger={remaining <= 60}
            icon={<ReloadOutlined />}
            loading={extending}
            onClick={handleExtend}
          >
            연장
          </Button>
        </Tooltip>
      )}
    </span>
  );
}
