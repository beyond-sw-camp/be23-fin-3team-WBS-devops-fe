import { Alert, Button, Space, Tag, Typography } from 'antd';
import { WarningFilled } from '@ant-design/icons';

const { Text } = Typography;

interface AtpShortage {
  productName: string;
  requested: number;
  atp: number;
  available: number;
  incoming: number;
  pending: number;
}

/**
 * BE 가 내려주는 ATP 부족 메시지를 파싱.
 * 포맷 예: "... 없습니다.\n - 27인치 모니터 (요청 100, ATP 0 = 가용 0 + 입고예정 0 + 검수중 0)"
 * 파싱 실패 시 null → 호출부가 원본 문자열을 그대로 표시.
 */
function parseShortages(message: string): { headline: string; items: AtpShortage[] } | null {
  const lines = message.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const headline = lines[0];
  const itemRegex = /^-?\s*(.+?)\s*\(요청\s*(\d+),\s*ATP\s*(\d+)\s*=\s*가용\s*(\d+)\s*\+\s*입고예정\s*(\d+)\s*\+\s*검수중\s*(\d+)\)/;
  const items: AtpShortage[] = [];
  for (const line of lines.slice(1)) {
    const m = itemRegex.exec(line);
    if (!m) return null;
    items.push({
      productName: m[1],
      requested: Number(m[2]),
      atp: Number(m[3]),
      available: Number(m[4]),
      incoming: Number(m[5]),
      pending: Number(m[6]),
    });
  }
  return items.length ? { headline, items } : null;
}

interface Props {
  message: string;
  onGoLowStock?: () => void;
  onGoInbound?: (prefill?: { productName: string; requestedQty: number }) => void;
}

export default function AtpShortageContent({ message, onGoLowStock, onGoInbound }: Props) {
  const parsed = parseShortages(message);

  if (!parsed) {
    return <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#475569' }}>{message}</div>;
  }

  return (
    <div>
      <Alert
        type="warning"
        showIcon
        icon={<WarningFilled />}
        message={parsed.headline}
        style={{ marginBottom: 12, border: 'none', background: '#fff7ed' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {parsed.items.map((it) => (
          <div
            key={it.productName}
            style={{
              border: '1px solid #fee2e2',
              background: '#fef2f2',
              borderRadius: 8,
              padding: '10px 14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text strong style={{ fontSize: 14, color: '#0f172a' }}>{it.productName}</Text>
              <Space size={6}>
                <Tag color="default" style={{ margin: 0 }}>요청 {it.requested.toLocaleString()}</Tag>
                <Tag color="red" style={{ margin: 0, fontWeight: 600 }}>ATP {it.atp.toLocaleString()}</Tag>
              </Space>
            </div>
            <Space size={12} style={{ fontSize: 12, color: '#64748b' }}>
              <span>가용 <b style={{ color: '#334155' }}>{it.available.toLocaleString()}</b></span>
              <span>입고예정 <b style={{ color: '#334155' }}>{it.incoming.toLocaleString()}</b></span>
              <span>검수중 <b style={{ color: '#334155' }}>{it.pending.toLocaleString()}</b></span>
            </Space>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
        ※ 입고 완료 후 가용 재고가 충분해지면 승인할 수 있습니다.
      </div>
      <Space size={8} style={{ marginTop: 10 }}>
        <Button size="small" onClick={onGoLowStock}>
          재고 부족 품목 보기
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={() => onGoInbound?.(
            parsed.items[0]
              ? { productName: parsed.items[0].productName, requestedQty: parsed.items[0].requested }
              : undefined,
          )}
        >
          입고 지시서로 이동
        </Button>
      </Space>
    </div>
  );
}
