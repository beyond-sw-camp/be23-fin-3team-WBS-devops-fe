import { Button, Card, Empty, Space, Table, Tag, Typography, Tooltip } from 'antd';
import { EnvironmentOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { useInventoryTransactionsByRef } from '@/hooks/useInventoryQuery';
import type { InventoryStockStatus, InventoryTransaction } from '@/types/inventory';
import type { InventoryTransactionRefType } from '@/api/inventory';
import { formatUserName } from '@/utils/formatUserName';

const { Text } = Typography;

interface Props {
  refId: string;
  refType: InventoryTransactionRefType;
  title?: string;
}

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

const TX_TYPE_LABEL: Record<string, string> = {
  inbound: '입고',
  outbound: '출고',
  reserve: '예약',
  unreserve: '예약해제',
  transfer: '이동',
  adjust: '조정',
  dispose: '폐기',
  returned: '반품',
  inspect: '검수',
};

/** 재고 종류 한글 라벨 + 태그 색 — Inventory.java enum 1:1 */
const STOCK_STATUS_META: Record<InventoryStockStatus, { label: string; color: string }> = {
  available: { label: '가용', color: 'green' },
  reserved: { label: '예약', color: 'orange' },
  defect: { label: '불량', color: 'red' },
  incoming: { label: '입고예정', color: 'blue' },
  pending: { label: '검수중', color: 'gold' },
};

function statusLabel(s: InventoryStockStatus | null | undefined): string {
  if (!s) return '-';
  return STOCK_STATUS_META[s]?.label ?? s;
}
function statusColor(s: InventoryStockStatus | null | undefined): string | undefined {
  if (!s) return undefined;
  return STOCK_STATUS_META[s]?.color;
}

/** LC-RK-...-065-01 -> 065 · 01 형태로 축약 */
function compactLocationCode(locationCode?: string | null): string {
  const raw = String(locationCode ?? '').trim();
  if (!raw) return '';
  const token = raw.startsWith('LC-') ? raw.slice(3) : raw;
  const parts = token.split('-').filter(Boolean);
  if (parts.length >= 2) {
    const floor = parts[parts.length - 1] ?? '';
    const rackTail = parts[parts.length - 2] ?? '';
    if (/^\d+$/.test(floor) && /^\d+$/.test(rackTail)) return `${rackTail} · ${floor}`;
  }
  if (raw.length > 22) return `${raw.slice(0, 10)}…${raw.slice(-6)}`;
  return raw;
}

export default function InventoryTransactionPanel({ refId, refType, title = '재고 변동 이력' }: Props) {
  const navigate = useNavigate();
  const { data: transactions = [], isLoading } = useInventoryTransactionsByRef(refId, refType);

  const goLocation = (tx: InventoryTransaction) => {
    if (!tx.warehouse_id) return;
    const params = new URLSearchParams({ wh: tx.warehouse_id, tab: 'rack-inventory' });
    if (tx.location_id) params.set('locationId', tx.location_id);
    if (tx.location_code) params.set('locationCode', tx.location_code);
    navigate(`/warehouse/monitoring?${params.toString()}`);
  };

  const columns: ColumnsType<InventoryTransaction> = [
    {
      title: '시간',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 145,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '-'}</Text>,
    },
    {
      title: '상품',
      key: 'product',
      width: 220,
      render: (_, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.product_name || '-'}</div>
          <Text type="secondary" style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }}>
            {r.product_id?.slice(0, 8) || ''}
          </Text>
        </div>
      ),
    },
    {
      title: '위치',
      key: 'location',
      width: 170,
      render: (_, r) => {
        const isNullLocation = !r.location_code && !r.location_id;
        if (isNullLocation) {
          return (
            <Tag color="gold" style={{ margin: 0, fontSize: 11 }}>
              입고존(대기)
            </Tag>
          );
        }
        if (!r.location_code) return <Text type="secondary">-</Text>;
        const compact = compactLocationCode(r.location_code);
        return (
          <Tooltip title={r.location_code} placement="topLeft">
            <Button
              type="link"
              size="small"
              icon={<EnvironmentOutlined />}
              style={{
                padding: 0,
                height: 'auto',
                fontFamily: 'ui-monospace, Menlo, monospace',
                maxWidth: 132,
                justifyContent: 'flex-start',
              }}
              onClick={() => goLocation(r)}
              disabled={!r.warehouse_id}
            >
              <span style={{ display: 'inline-block', maxWidth: 106, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {compact}
              </span>
            </Button>
          </Tooltip>
        );
      },
    },
    {
      title: '유형',
      dataIndex: 'type',
      key: 'type',
      width: 90,
      align: 'center',
      render: (v: string) => <Tag color="blue">{TX_TYPE_LABEL[v] ?? v}</Tag>,
    },
    {
      title: '재고 종류',
      key: 'stockKind',
      width: 130,
      align: 'center',
      render: (_, r) => {
        const from = r.status_from ?? null;
        const to = r.status_to ?? null;
        // 둘 다 없음 — 백엔드 미수신
        if (!from && !to) return <Text type="secondary" style={{ fontSize: 11 }}>-</Text>;
        // 같은 종류 안 증감 → 단일 태그
        if (from && to && from === to) {
          return <Tag color={statusColor(to)} style={{ margin: 0, fontSize: 11 }}>{statusLabel(to)}</Tag>;
        }
        // 전이(예: pending → available) — 화살표
        if (from && to) {
          return (
            <Space size={2} wrap={false}>
              <Tag color={statusColor(from)} style={{ margin: 0, fontSize: 11 }}>{statusLabel(from)}</Tag>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>→</span>
              <Tag color={statusColor(to)} style={{ margin: 0, fontSize: 11 }}>{statusLabel(to)}</Tag>
            </Space>
          );
        }
        // 한쪽만 있음 — 단순 추가/차감
        const one = (to ?? from) as InventoryStockStatus;
        return <Tag color={statusColor(one)} style={{ margin: 0, fontSize: 11 }}>{statusLabel(one)}</Tag>;
      },
    },
    {
      title: '증감',
      key: 'delta',
      width: 90,
      align: 'right',
      render: (_, r) => {
        const delta = r.after_qty - r.before_qty;
        const color = delta > 0 ? 'green' : delta < 0 ? 'red' : 'default';
        const sign = delta > 0 ? '+' : '';
        return <Tag color={color} style={{ margin: 0 }}>{sign}{delta.toLocaleString()}</Tag>;
      },
    },
    {
      title: '전/후',
      key: 'beforeAfter',
      width: 130,
      align: 'right',
      render: (_, r) => (
        <Text style={{ fontSize: 12 }}>
          {r.before_qty.toLocaleString()} → {r.after_qty.toLocaleString()}
        </Text>
      ),
    },
    {
      title: '처리자',
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: 130,
      render: (_: string | undefined, r) => {
        const name = r.created_by_name?.trim();
        const isSystem = r.created_by === SYSTEM_USER_ID || name === '시스템';
        if (isSystem) {
          return (
            <Tag icon={<SettingOutlined />} color="default" style={{ margin: 0, fontSize: 11 }}>
              시스템
            </Tag>
          );
        }
        return <span style={{ fontSize: 12 }}>{formatUserName(name)}</span>;
      },
    },
    {
      title: '비고',
      dataIndex: 'note',
      key: 'note',
      width: 240,
      render: (v: string | undefined) => (
        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 }}>
          {v || '-'}
        </span>
      ),
    },
  ];

  return (
    <Card
      size="small"
      title={(
        <Space size={8}>
          <span>{title}</span>
          <Tag color={transactions.length > 0 ? 'processing' : 'default'}>{transactions.length}건</Tag>
        </Space>
      )}
      style={{ marginTop: 16, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <Table
        columns={columns}
        dataSource={transactions}
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="재고 변동 이력이 없습니다" /> }}
        scroll={{ x: 1250 }}
      />
    </Card>
  );
}
