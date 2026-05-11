import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App, Button, Card, Empty, Progress, Segmented, Space, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  ApartmentOutlined, CheckOutlined, ReloadOutlined, RocketOutlined, TeamOutlined, UserSwitchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getUsers } from '@/api/settings';
import { getInboundOrders, approveInboundOrder } from '@/api/inbound';
import {
  getOutboundOrders, approveOutboundOrder, getEtcInOutOrders, approveEtcInOut, getPickingLists,
} from '@/api/order';
import { createWave } from '@/api/pickingList';
import type {
  EtcInOutOrder, InboundOrder, OrderStatus, OutboundOrder, PickingList, PickingStatus,
} from '@/types/order';
import { ORDER_STATUS_CONFIG, PICKING_STATUS_CONFIG } from '@/types/order';
import type { UserListItem } from '@/types/user';
import { extractApiErrorMessage } from '@/utils/apiError';

const { Title, Text } = Typography;

type QueueKind = 'inbound' | 'outbound' | 'etc' | 'wave';
type TabKey = 'queue' | 'active' | 'workers';

interface QueueRow {
  key: string;
  kind: QueueKind;
  label: string;
  orderNo: string;
  warehouseName: string;
  partnerName: string;
  qty: number;
  createdAt: string | null;
  status: OrderStatus | 'ready';
  targetId: string;
}

interface ActiveRow {
  key: string;
  label: string;
  orderNo: string;
  warehouseName: string;
  assigneeId: string | null;
  assigneeName: string;
  status: PickingStatus | EtcInOutOrder['status'] | OrderStatus;
  createdAt: string | null;
  targetPath: string;
}

interface WorkerLoadRow {
  id: string;
  name: string;
  loginId: string;
  role: string;
  activeCount: number;
  pickingCount: number;
  etcCount: number;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '-';
  const m = v.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!m) return v;
  return m[2] ? `${m[1]} ${m[2]}` : m[1];
}

function isAssignable(user: UserListItem): boolean {
  const role = (user.roleCode ?? '').toUpperCase();
  return role.includes('OPERATOR') || role.includes('MANAGER');
}

function statusTag(status: QueueRow['status'] | ActiveRow['status']) {
  if (status === 'ready') return <Tag color="blue">웨이브 대기</Tag>;
  if (status in PICKING_STATUS_CONFIG) {
    const cfg = PICKING_STATUS_CONFIG[status as PickingStatus];
    return <Tag color={cfg.color}>{cfg.label}</Tag>;
  }
  if (status in ORDER_STATUS_CONFIG) {
    const cfg = ORDER_STATUS_CONFIG[status as OrderStatus];
    return <Tag color={cfg.color}>{cfg.label}</Tag>;
  }
  const etcLabel: Record<string, string> = {
    draft: '초안',
    approved: '승인',
    completed: '완료',
    cancelled: '취소',
  };
  const color: Record<string, string> = {
    draft: 'default',
    approved: 'processing',
    completed: 'success',
    cancelled: 'error',
  };
  return <Tag color={color[String(status)] ?? 'default'}>{etcLabel[String(status)] ?? String(status)}</Tag>;
}

function buildQueueRows(
  inboundOrders: InboundOrder[],
  outboundOrders: OutboundOrder[],
  etcOrders: EtcInOutOrder[],
): QueueRow[] {
  const inbound = inboundOrders
    .filter((o) => o.status === 'draft')
    .map((o) => ({
      key: `inbound-${o.id}`,
      kind: 'inbound' as const,
      label: '입고 검수',
      orderNo: o.order_no,
      warehouseName: o.warehouse_name,
      partnerName: o.vendor_name,
      qty: o.total_qty ?? 0,
      createdAt: o.created_at,
      status: o.status,
      targetId: o.id,
    }));

  const outboundDraft = outboundOrders
    .filter((o) => o.status === 'draft')
    .map((o) => ({
      key: `outbound-${o.id}`,
      kind: 'outbound' as const,
      label: '출고 검수',
      orderNo: o.order_no,
      warehouseName: o.warehouse_name,
      partnerName: o.store_name,
      qty: o.total_qty ?? 0,
      createdAt: o.created_at,
      status: o.status,
      targetId: o.id,
    }));

  const waveReady = outboundOrders
    .filter((o) => o.status === 'approved' && (o.picking_list_ids?.length ?? 0) === 0)
    .map((o) => ({
      key: `wave-${o.id}`,
      kind: 'wave' as const,
      label: '피킹 웨이브',
      orderNo: o.order_no,
      warehouseName: o.warehouse_name,
      partnerName: o.store_name,
      qty: o.total_qty ?? 0,
      createdAt: o.created_at,
      status: 'ready' as const,
      targetId: o.id,
    }));

  const etc = etcOrders
    .filter((o) => o.status === 'draft')
    .map((o) => ({
      key: `etc-${o.id}`,
      kind: 'etc' as const,
      label: o.direction === 'in' ? '기타 입고' : '기타 출고',
      orderNo: o.order_no,
      warehouseName: o.warehouse_name,
      partnerName: o.supplier_name ?? o.store_name ?? '-',
      qty: 0,
      createdAt: o.created_at,
      status: 'draft' as OrderStatus,
      targetId: o.id,
    }));

  return [...inbound, ...outboundDraft, ...waveReady, ...etc];
}

function buildActiveRows(
  inboundOrders: InboundOrder[],
  outboundOrders: OutboundOrder[],
  pickingLists: PickingList[],
  etcOrders: EtcInOutOrder[],
  nameById: Map<string, string>,
): ActiveRow[] {
  const inbound = inboundOrders
    .filter((o) => o.status === 'approved')
    .map((o) => ({
      key: `inbound-${o.id}`,
      label: '입고 검수',
      orderNo: o.order_no,
      warehouseName: o.warehouse_name,
      assigneeId: o.assigned_to ?? null,
      assigneeName: o.assigned_to_name ?? (o.assigned_to ? nameById.get(o.assigned_to) : null) ?? '미지정',
      status: o.status,
      createdAt: o.created_at,
      targetPath: `/order/inbound/${o.id}`,
    }));

  const outbound = outboundOrders
    .filter((o) => o.status === 'approved' || o.status === 'in_progress' || o.status === 'partial')
    .map((o) => ({
      key: `outbound-${o.id}`,
      label: '출고 담당',
      orderNo: o.order_no,
      warehouseName: o.warehouse_name,
      assigneeId: o.assigned_to ?? null,
      assigneeName: o.assigned_to_name ?? (o.assigned_to ? nameById.get(o.assigned_to) : null) ?? '미지정',
      status: o.status,
      createdAt: o.created_at,
      targetPath: `/order/outbound/${o.id}`,
    }));

  const picking = pickingLists
    .filter((p) => p.status === 'pending' || p.status === 'in_progress')
    .map((p) => ({
      key: `picking-${p.id}`,
      label: '피킹',
      orderNo: p.picking_no,
      warehouseName: p.warehouse_name,
      assigneeId: p.assigned_to ?? null,
      assigneeName: p.assignee && p.assignee !== '-' ? p.assignee : '미지정',
      status: p.status,
      createdAt: p.created_at ?? null,
      targetPath: `/order/picking/${p.id}`,
    }));

  const etc = etcOrders
    .filter((o) => o.status === 'approved')
    .map((o) => ({
      key: `etc-${o.id}`,
      label: o.direction === 'in' ? '기타 입고' : '기타 출고',
      orderNo: o.order_no,
      warehouseName: o.warehouse_name,
      assigneeId: o.assigned_to ?? null,
      assigneeName: o.assigned_to_name ?? '미지정',
      status: o.status,
      createdAt: o.created_at,
      targetPath: `/etc-inout/${o.direction}/${o.id}`,
    }));

  return [...inbound, ...outbound, ...picking, ...etc];
}

export default function AutoAssignmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [tab, setTab] = useState<TabKey>('queue');

  const usersQuery = useQuery({ queryKey: ['users-for-auto-assignment'], queryFn: getUsers });
  const inboundQuery = useQuery({ queryKey: ['auto-assignment', 'inbound-orders'], queryFn: () => getInboundOrders() });
  const outboundQuery = useQuery({ queryKey: ['auto-assignment', 'outbound-orders'], queryFn: () => getOutboundOrders() });
  const pickingQuery = useQuery({ queryKey: ['auto-assignment', 'picking-lists'], queryFn: getPickingLists, refetchInterval: 5000 });
  const etcQuery = useQuery({ queryKey: ['auto-assignment', 'etc-inout-orders'], queryFn: getEtcInOutOrders });

  const users = usersQuery.data ?? [];
  const assignableUsers = useMemo(() => users.filter(isAssignable), [users]);
  const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const queueRows = useMemo(
    () => buildQueueRows(inboundQuery.data ?? [], outboundQuery.data ?? [], etcQuery.data ?? []),
    [inboundQuery.data, outboundQuery.data, etcQuery.data],
  );
  const activeRows = useMemo(
    () => buildActiveRows(
      inboundQuery.data ?? [],
      outboundQuery.data ?? [],
      pickingQuery.data ?? [],
      etcQuery.data ?? [],
      nameById,
    ),
    [inboundQuery.data, outboundQuery.data, pickingQuery.data, etcQuery.data, nameById],
  );

  const workerRows = useMemo<WorkerLoadRow[]>(() => {
    const byUser = new Map<string, WorkerLoadRow>();
    assignableUsers.forEach((u) => {
      byUser.set(u.id, {
        id: u.id,
        name: u.name,
        loginId: u.loginId,
        role: u.roleName ?? u.roleCode ?? '-',
        activeCount: 0,
        pickingCount: 0,
        etcCount: 0,
      });
    });
    activeRows.forEach((row) => {
      if (!row.assigneeId) return;
      const existing = byUser.get(row.assigneeId);
      if (!existing) return;
      existing.activeCount += 1;
      if (row.label === '피킹') existing.pickingCount += 1;
      else existing.etcCount += 1;
    });
    return Array.from(byUser.values()).sort((a, b) => a.activeCount - b.activeCount || a.name.localeCompare(b.name));
  }, [activeRows, assignableUsers]);

  const refreshAll = async () => {
    await Promise.all([
      usersQuery.refetch(),
      inboundQuery.refetch(),
      outboundQuery.refetch(),
      pickingQuery.refetch(),
      etcQuery.refetch(),
    ]);
  };

  const invalidateWork = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['auto-assignment'] }),
      queryClient.invalidateQueries({ queryKey: ['inbound-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['outbound-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['picking-lists'] }),
      queryClient.invalidateQueries({ queryKey: ['wave-picking-lists'] }),
      queryClient.invalidateQueries({ queryKey: ['etc-inout-orders'] }),
    ]);
  };

  const runMutation = useMutation({
    mutationFn: async (row: QueueRow) => {
      if (row.kind === 'inbound') {
        await approveInboundOrder(row.targetId);
        return '입고 지시서 승인 및 자동배정 완료';
      }
      if (row.kind === 'outbound') {
        await approveOutboundOrder(row.targetId);
        return '출고 지시서 승인 및 자동배정 완료';
      }
      if (row.kind === 'etc') {
        await approveEtcInOut(row.targetId);
        return '기타입출고 승인 및 자동배정 완료';
      }
      const { picking } = await createWave({ outboundOrderIds: [row.targetId], assignments: {} });
      return `피킹 ${picking.picking_no} 자동배정 완료`;
    },
    onSuccess: async (text) => {
      message.success(text);
      await invalidateWork();
    },
    onError: (e) => {
      message.error(extractApiErrorMessage(e, '자동배정 실행 실패'));
    },
  });

  const queueColumns: ColumnsType<QueueRow> = [
    {
      title: '업무', dataIndex: 'label', key: 'label', width: 120,
      render: (v: string, r) => (
        <Space size={6}>
          <Tag color={r.kind === 'wave' ? 'blue' : 'geekblue'} style={{ margin: 0 }}>{v}</Tag>
        </Space>
      ),
    },
    {
      title: '지시서', dataIndex: 'orderNo', key: 'orderNo', width: 150,
      render: (v: string, r) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', fontWeight: 600 }}
          onClick={() => {
            if (r.kind === 'inbound') navigate(`/order/inbound/${r.targetId}`);
            else if (r.kind === 'outbound' || r.kind === 'wave') navigate(`/order/outbound/${r.targetId}`);
            else navigate(`/etc-inout/${r.label === '기타 입고' ? 'in' : 'out'}/${r.targetId}`);
          }}
        >
          {v}
        </Button>
      ),
    },
    { title: '창고', dataIndex: 'warehouseName', key: 'warehouseName', width: 150 },
    { title: '거래처', dataIndex: 'partnerName', key: 'partnerName', ellipsis: true },
    {
      title: '수량', dataIndex: 'qty', key: 'qty', width: 90, align: 'right',
      render: (v: number) => (v > 0 ? v.toLocaleString() : '-'),
    },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 110, align: 'center',
      render: statusTag,
    },
    { title: '생성일', dataIndex: 'createdAt', key: 'createdAt', width: 130, render: fmtDate },
    {
      title: '실행', key: 'action', width: 130, align: 'center',
      render: (_, r) => (
        <Button
          size="small"
          type="primary"
          icon={r.kind === 'wave' ? <RocketOutlined /> : <CheckOutlined />}
          loading={runMutation.isPending && runMutation.variables?.key === r.key}
          onClick={() => runMutation.mutate(r)}
        >
          {r.kind === 'wave' ? '웨이브 생성' : '승인'}
        </Button>
      ),
    },
  ];

  const activeColumns: ColumnsType<ActiveRow> = [
    { title: '업무', dataIndex: 'label', key: 'label', width: 120, render: (v: string) => <Tag color="blue">{v}</Tag> },
    {
      title: '작업번호', dataIndex: 'orderNo', key: 'orderNo', width: 160,
      render: (v: string, r) => (
        <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => navigate(r.targetPath)}>
          {v}
        </Button>
      ),
    },
    { title: '창고', dataIndex: 'warehouseName', key: 'warehouseName', width: 150 },
    {
      title: '담당자', dataIndex: 'assigneeName', key: 'assigneeName', width: 150,
      render: (v: string) => <Space size={6}><UserSwitchOutlined style={{ color: '#1677ff' }} />{v}</Space>,
    },
    { title: '상태', dataIndex: 'status', key: 'status', width: 110, align: 'center', render: statusTag },
    { title: '생성일', dataIndex: 'createdAt', key: 'createdAt', width: 140, render: fmtDate },
  ];

  const workerColumns: ColumnsType<WorkerLoadRow> = [
    {
      title: '작업자', key: 'worker', width: 220,
      render: (_, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.loginId} · {r.role}</Text>
        </div>
      ),
    },
    {
      title: '활성 작업', dataIndex: 'activeCount', key: 'activeCount', width: 110, align: 'right',
      render: (v: number) => <Text strong>{v.toLocaleString()}</Text>,
    },
    {
      title: '부하', key: 'load', width: 220,
      render: (_, r) => <Progress percent={Math.min(100, r.activeCount * 20)} showInfo={false} strokeColor={r.activeCount >= 4 ? '#faad14' : '#1677ff'} />,
    },
    { title: '피킹', dataIndex: 'pickingCount', key: 'pickingCount', width: 90, align: 'right' },
    { title: '기타입출고', dataIndex: 'etcCount', key: 'etcCount', width: 110, align: 'right' },
  ];

  const isLoading = usersQuery.isLoading || inboundQuery.isLoading || outboundQuery.isLoading || pickingQuery.isLoading || etcQuery.isLoading;
  const activeAssigneeCount = new Set(activeRows.map((r) => r.assigneeId).filter(Boolean)).size;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Title level={4} style={{ margin: 0 }}>작업자 자동배정</Title>
        <Space>
          <Tooltip title="목록 새로고침">
            <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={isLoading}>새로고침</Button>
          </Tooltip>
        </Space>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
        <Card size="small">
          <Statistic title="배정 가능 작업자" value={assignableUsers.length} prefix={<TeamOutlined />} />
        </Card>
        <Card size="small">
          <Statistic title="자동배정 대기" value={queueRows.length} prefix={<ApartmentOutlined />} />
        </Card>
        <Card size="small">
          <Statistic title="진행 작업" value={activeRows.length} prefix={<UserSwitchOutlined />} />
        </Card>
        <Card size="small">
          <Statistic title="작업 중 인원" value={activeAssigneeCount} prefix={<RocketOutlined />} />
        </Card>
      </div>

      <Card size="small" styles={{ body: { padding: 16 } }}>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          options={[
            { value: 'queue', label: `자동배정 대기 ${queueRows.length}` },
            { value: 'active', label: `배정 현황 ${activeRows.length}` },
            { value: 'workers', label: `작업자 부하 ${workerRows.length}` },
          ]}
          style={{ marginBottom: 12 }}
        />

        {tab === 'queue' && (
          <Table
            size="small"
            columns={queueColumns}
            dataSource={queueRows}
            rowKey="key"
            loading={isLoading}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="자동배정 대기 작업이 없습니다" /> }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        )}
        {tab === 'active' && (
          <Table
            size="small"
            columns={activeColumns}
            dataSource={activeRows}
            rowKey="key"
            loading={isLoading}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="진행 중인 배정 작업이 없습니다" /> }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        )}
        {tab === 'workers' && (
          <Table
            size="small"
            columns={workerColumns}
            dataSource={workerRows}
            rowKey="id"
            loading={isLoading}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="배정 가능 작업자가 없습니다" /> }}
            pagination={false}
          />
        )}
      </Card>
    </div>
  );
}
