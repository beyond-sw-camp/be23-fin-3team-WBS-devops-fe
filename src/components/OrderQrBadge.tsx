import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';

interface OrderQrBadgeProps {
  /** QR에 박히는 실제 값 (보통 백엔드 UUID) */
  value: string;
  /** 화면 캡션용 라벨 (사람이 읽는 지시서번호 등) */
  label?: string;
  title?: string;
  size?: number;
  /** 인쇄·DOM 복제 시 Canvas가 더 안정적인 경우가 많음 */
  variant?: 'svg' | 'canvas';
  /** 지시서 헤더용: 80×80 고정, 캡션 없이 QR만 */
  compact?: boolean;
}

export default function OrderQrBadge({
  value,
  label,
  title = '지시서 QR',
  size = 72,
  variant = 'svg',
  compact = false,
}: OrderQrBadgeProps) {
  const Qr = variant === 'canvas' ? QRCodeCanvas : QRCodeSVG;

  if (compact) {
    const inner = 76;
    return (
      <div
        style={{
          width: 80,
          height: 80,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #d8d8d8',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <Qr value={value} size={inner} />
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <Qr value={value} size={size} />
      <div style={{ fontSize: 11, color: '#666', lineHeight: 1.2, textAlign: 'center' }}>
        <div>{title}</div>
        {label ? <strong style={{ color: '#111' }}>{label}</strong> : null}
      </div>
    </div>
  );
}