import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Table, Tag, Select, Space, Empty } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAuditLogs } from '@/hooks/useCommonQuery';
import type { AuditLog } from '@/types/common';

const { Title, Text } = Typography;

/**
 * 알림 이력 페이지 — 운영자가 즉시 대응해야 하는 alert 류만.
 *
 * 데이터 소스: audit_logs (ES 검색).
 * BE 의 AlertAuditLogger 가 알림 push 시점에 audit_logs 에 1행 저장 →
 * 이 페이지가 includeActions 화이트리스트로 알림 종류만 필터해 시간순 조회.
 *
 * 일반 운영 이력(승인/완료/취소...)은 [감사 로그] 페이지에서 담당. 역할 분리.
 */

const ALERT_ACTIONS = ['출고불가발생', '출고불가해소', '재고부족발생', '재고부족해소'] as const;
type AlertAction = (typeof ALERT_ACTIONS)[number];

const ACTION_CONFIG: Record<AlertAction, { color: string; label: string }> = {
  '출고불가발생':  { color: 'red',     label: '출고불가' },
  '출고불가해소':  { color: 'green',   label: '출고불가 해소' },
  '재고부족발생':  { color: 'volcano', label: '재고부족' },
  '재고부족해소':  { color: 'cyan',    label: '재고부족 해소' },
};

interface AlertRow {
  id: string;
  action: AlertAction;
  title: string;
  content: string;
  ref_item: string;
  created_at: string;
  /** 클릭 시 이동할 라우트 (없으면 비활성) */
  nav_path: string | null;
}

/** audit_log.request_body JSON 파싱 — 알림 payload 구조에 맞춰 row 변환 */
function toAlertRow(log: AuditLog): AlertRow | null {
  const action = log.action as AlertAction;
  if (!ALERT_ACTIONS.includes(action)) return null;
  let payload: Record<string, unknown> = {};
  if (log.request_body) {
    try {
      payload = JSON.parse(log.request_body) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }

  if (action === '출고불가발생' || action === '출고불가해소') {
    const soNo = (payload.soNo as string) ?? '';
    const storeName = (payload.storeName as string) ?? '';
    const items = (payload.items as Array<{ productName?: string; shortageQty?: number }>) ?? [];
    const head = items[0];
    const more = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
    const title = `${ACTION_CONFIG[action].label}: ${soNo || '-'}`;
    const content = action === '출고불가발생'
      ? (head ? `${head.productName ?? ''} ${head.shortageQty ?? 0}개 부족${more}` : '재고 부족 발생')
      : `${storeName || '-'} — 재고 부족 해소`;
    const salesOrderId = payload.salesOrderId as string | undefined;
    return {
      id: log.id,
      action,
      title,
      content,
      ref_item: storeName || soNo || '-',
      created_at: log.created_at,
      nav_path: salesOrderId ? `/order/sales-orders/${salesOrderId}/progress` : null,
    };
  }

  // 재고부족발생/해소
  const productName = (payload.productName as string) ?? '';
  const sku = (payload.sku as string) ?? '';
  const warehouseName = (payload.warehouseName as string) ?? '';
  const availableQty = (payload.availableQty as number) ?? 0;
  const minStockQty = (payload.minStockQty as number) ?? 0;
  const title = `${ACTION_CONFIG[action].label}: ${productName} (${sku})`;
  const content = action === '재고부족발생'
    ? `현재 ${availableQty} / 안전재고 ${minStockQty}${warehouseName ? ` · ${warehouseName}` : ''}`
    : `${warehouseName || '-'} — 재고 부족 해소`;
  return {
    id: log.id,
    action,
    title,
    content,
    ref_item: warehouseName || sku || '-',
    created_at: log.created_at,
    nav_path: '/common/low-stock',
  };
}

function fmtDateTime(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : iso;
}

export default function NotificationPage() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<AlertAction | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // typeFilter 가 있으면 단일 action, 없으면 4가지 화이트리스트 전부
  const includeActions = typeFilter ?? ALERT_ACTIONS.join(',');
  const { data, isLoading } = useAuditLogs(
    { includeActions, page, size: PAGE_SIZE },
    { refetchInterval: 30_000 }, // 새 알림 자동 반영
  );

  const rows = useMemo(() => {
    return (data?.content ?? [])
      .map(toAlertRow)
      .filter((r): r is AlertRow => r !== null);
  }, [data]);

  const columns: ColumnsType<AlertRow> = [
    {
      title: '유형', dataIndex: 'action', key: 'action', width: 130,
      render: (v: AlertAction) => (
        <Tag color={ACTION_CONFIG[v]?.color}>{ACTION_CONFIG[v]?.label ?? v}</Tag>
      ),
    },
    {
      title: '제목', dataIndex: 'title', key: 'title', width: 280,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    { title: '내용', dataIndex: 'content', key: 'content', ellipsis: true },
    {
      title: '관련항목', dataIndex: 'ref_item', key: 'ref_item', width: 160,
      render: (v: string) => <Text type="secondary">{v}</Text>,
    },
    {
      title: '일시', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => (
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
          {fmtDateTime(v)}
        </span>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BellOutlined style={{ fontSize: 20 }} />
          <Title level={4} style={{ margin: 0 }}>알림 이력</Title>
        </div>
        <Space>
          <Select
            placeholder="유형 필터"
            allowClear
            style={{ width: 180 }}
            value={typeFilter}
            onChange={(v) => { setTypeFilter((v as AlertAction | undefined) ?? null); setPage(0); }}
            options={ALERT_ACTIONS.map((a) => ({ label: ACTION_CONFIG[a].label, value: a }))}
          />
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={rows}
        rowKey="id"
        size="middle"
        loading={isLoading}
        locale={{ emptyText: <Empty description="알림 이력이 없습니다" /> }}
        onRow={(r) => ({
          onClick: () => { if (r.nav_path) navigate(r.nav_path); },
          style: { cursor: r.nav_path ? 'pointer' : 'default' },
        })}
        pagination={{
          current: page + 1,
          pageSize: PAGE_SIZE,
          total: data?.totalElements ?? 0,
          showSizeChanger: false,
          onChange: (p) => setPage(p - 1),
        }}
      />
    </>
  );
}
