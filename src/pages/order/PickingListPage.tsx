import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  Typography, Table, Tag, Space, Modal, Tabs, Badge, App, Card, Input, DatePicker, Button,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, CalendarOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import type { OutboundOrder, PickingList, PickingStatus, OrderStatus } from '@/types/order';
import { ORDER_STATUS_CONFIG, PICKING_STATUS_CONFIG } from '@/types/order';
import { usePickingLists, useSearchPickingLists, useOutboundOrders } from '@/hooks/useOrderQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';
import WaveCreateModal from '@/components/WaveCreateModal';
import PermissionButton from '@/components/PermissionButton';
import AssignedWorkerCell from '@/components/AssignedWorkerCell';
import { useUserNameMap, resolveUserName } from '@/hooks/useUserNameMap';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';

const { Title, Text } = Typography;

// ISO datetime (2026-04-22T00:43:07.195778) → '2026-04-22 00:43'
function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '-';
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : v;
}

/** 피킹 리스트 탭 정의 — 백엔드 상태를 업무 단계로 묶음 */
type PickingTabKey = 'all' | 'pending' | 'in_progress' | 'completed' | 'issue';

const TAB_STATUSES: Record<PickingTabKey, PickingStatus[] | null> = {
  all: null,
  pending: ['pending'],
  in_progress: ['in_progress'],
  completed: ['completed'],
  issue: ['partial'],
};

const TAB_LABELS: Record<PickingTabKey, string> = {
  all: '전체',
  pending: '대기',
  in_progress: '진행중',
  completed: '완료',
  issue: '이슈',
};

const TAB_BADGE_COLOR: Record<PickingTabKey, string> = {
  all: '#64748b',
  pending: '#1677ff',
  in_progress: '#f59e0b',
  completed: '#52c41a',
  issue: '#ef4444',
};

export default function PickingListPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PickingTabKey>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId ? `/topic/admin/picking/${clientId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['picking-lists'] });
      showStompToast(message, event);
    },
  );

  const productFilter = useProductFilterForOrder();
  const { data: rawLists = [], isLoading: rawLoading } = usePickingLists();
  const { data: searchedLists = [], isLoading: searchLoading } = useSearchPickingLists(productFilter.productIds);
  const allLists = productFilter.isFiltering ? searchedLists : rawLists;
  const isLoading = productFilter.isFiltering ? searchLoading : rawLoading;
  const { data: outboundOrders = [] } = useOutboundOrders();
  const [selectOpen, setSelectOpen] = useState(false);
  const [waveOpen, setWaveOpen] = useState(false);
  const [selectedOutboundIds, setSelectedOutboundIds] = useState<string[]>([]);
  const userMap = useUserNameMap();

  const inDateRange = (iso: string | null | undefined): boolean => {
    if (!dateFrom && !dateTo) return true;
    if (!iso) return false;
    const d = dayjs(iso);
    if (!d.isValid()) return false;
    if (dateFrom && d.isBefore(dateFrom, 'day')) return false;
    if (dateTo && d.isAfter(dateTo, 'day')) return false;
    return true;
  };

  const resetFilters = () => {
    setSearchKeyword('');
    setDateFrom(null);
    setDateTo(null);
  };

  /** 검색어 + 생성일 범위 적용한 결과 */
  const filteredAll = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    return allLists.filter((l) => {
      if (kw) {
        const assignee = (l.assignee && l.assignee !== '-')
          ? l.assignee
          : (l.assigned_to ? resolveUserName(userMap, l.assigned_to) : '');
        const hits = (l.picking_no ?? '').toLowerCase().includes(kw)
          || (l.warehouse_name ?? '').toLowerCase().includes(kw)
          || assignee.toLowerCase().includes(kw);
        if (!hits) return false;
      }
      if (!inDateRange(l.created_at)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLists, searchKeyword, dateFrom, dateTo, userMap]);

  // 탭별 건수 (필터 반영)
  const tabCounts = useMemo(() => {
    const counts: Record<PickingTabKey, number> = {
      all: filteredAll.length,
      pending: 0,
      in_progress: 0,
      completed: 0,
      issue: 0,
    };
    filteredAll.forEach((l) => {
      (Object.keys(TAB_STATUSES) as PickingTabKey[]).forEach((key) => {
        const statuses = TAB_STATUSES[key];
        if (key !== 'all' && statuses?.includes(l.status)) counts[key] += 1;
      });
    });
    return counts;
  }, [filteredAll]);

  // 현재 탭에 해당하는 피킹리스트만 필터
  const lists = useMemo(() => {
    const statuses = TAB_STATUSES[activeTab];
    if (!statuses) return filteredAll;
    return filteredAll.filter((l) => statuses.includes(l.status));
  }, [filteredAll, activeTab]);

  const columns: ColumnsType<PickingList> = [
    { title: '피킹번호', dataIndex: 'picking_no', key: 'picking_no', width: 140 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
    {
      title: '배정 작업자', key: 'assignee', width: 130,
      render: (_, r) => (
        <AssignedWorkerCell
          assignedTo={r.assigned_to ?? null}
          assignedToName={r.assignee && r.assignee !== '-' ? r.assignee : null}
          userMap={userMap}
        />
      ),
    },
    { title: '출고지시서 수', dataIndex: 'outbound_count', key: 'outbound_count', width: 120, align: 'center' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 100, align: 'center', render: (v: PickingStatus) => <Tag color={PICKING_STATUS_CONFIG[v].color}>{PICKING_STATUS_CONFIG[v].label}</Tag> },
    { title: '생성일시', dataIndex: 'created_at', key: 'created_at', width: 140, render: fmtDateTime },
    { title: '시작일시', dataIndex: 'started_at', key: 'started_at', width: 140, render: fmtDateTime },
    { title: '완료일시', dataIndex: 'completed_at', key: 'completed_at', width: 140, render: fmtDateTime },
  ];
  const outboundColumns: ColumnsType<OutboundOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 130 },
    { title: '출고처', dataIndex: 'store_name', key: 'store_name', width: 140 },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90, render: (v: OrderStatus) => <Tag color={ORDER_STATUS_CONFIG[v].color}>{ORDER_STATUS_CONFIG[v].label}</Tag> },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 90, align: 'right', render: (v) => v?.toLocaleString() ?? '-' },
  ];
  const approvedOrders = useMemo(() => outboundOrders.filter((o) => o.status === 'approved'), [outboundOrders]);

  const proceedToWave = () => {
    if (selectedOutboundIds.length === 0) return;
    setSelectOpen(false);
    setWaveOpen(true);
  };

  const handleWaveSuccess = (picking: PickingList) => {
    setWaveOpen(false);
    setSelectedOutboundIds([]);
    navigate(`/order/picking/${picking.id}`);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Title level={4} style={{ margin: 0 }}>피킹 리스트</Title>
        <Space>
          <PermissionButton resource="OUTBOUND" action="CREATE" type="primary" onClick={() => setSelectOpen(true)} disabled={approvedOrders.length === 0}>
            웨이브 피킹 생성
          </PermissionButton>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '18px 20px' } }}>
        <Text strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>검색 조건</Text>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: 24,
            rowGap: 10,
          }}
        >
          <Space size={8} align="center">
            <SearchOutlined style={{ color: '#64748b' }} />
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>검색어</Text>
            <Input
              placeholder="피킹번호 / 창고 / 담당자"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
              style={{ width: 240 }}
            />
          </Space>
          <Space size={8} align="center">
            <CalendarOutlined style={{ color: '#64748b' }} />
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>생성일</Text>
            <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="시작" style={{ width: 140 }} />
            <Text type="secondary">~</Text>
            <DatePicker value={dateTo} onChange={setDateTo} placeholder="종료" style={{ width: 140 }} />
          </Space>
          <div style={{ marginLeft: 'auto' }}>
            <Space size={8}>
              <ProductFilterTriggerButton
                {...productFilter}
                matchedProductCount={productFilter.productIds?.length ?? null}
              />
              <Button icon={<ReloadOutlined />} onClick={resetFilters}>초기화</Button>
            </Space>
          </div>
        </div>
        {productFilter.isFiltering && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px dashed #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <ProductFilterStatusBar
              {...productFilter}
              matchedProductCount={productFilter.productIds?.length ?? null}
              filteredLineCount={filteredAll.length}
            />
          </div>
        )}
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as PickingTabKey)}
        items={(Object.keys(TAB_STATUSES) as PickingTabKey[]).map((key) => ({
          key,
          label: (
            <Space size={8}>
              <span>{TAB_LABELS[key]}</span>
              <Badge
                count={tabCounts[key]}
                showZero
                style={{
                  backgroundColor: activeTab === key ? TAB_BADGE_COLOR[key] : '#e2e8f0',
                  color: activeTab === key ? '#fff' : '#64748b',
                }}
                overflowCount={999}
              />
            </Space>
          ),
        }))}
        style={{ marginBottom: 8 }}
      />

      <Table columns={columns} dataSource={lists} rowKey="id" loading={isLoading}
        onRow={(r) => ({ onClick: () => navigate(`/order/picking/${r.id}`), style: { cursor: 'pointer' } })} />

      <Modal
        title="출고지시서 선택"
        open={selectOpen}
        onCancel={() => setSelectOpen(false)}
        onOk={proceedToWave}
        okText="다음 (담당자 배정)"
        cancelText="취소"
        okButtonProps={{ disabled: selectedOutboundIds.length === 0 }}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            승인된 출고지시서 중 웨이브로 묶을 지시서를 선택하세요. 같은 창고의 지시서끼리 묶는 걸 권장합니다.
          </div>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={approvedOrders}
            columns={outboundColumns}
            rowSelection={{
              selectedRowKeys: selectedOutboundIds,
              onChange: (keys) => setSelectedOutboundIds(keys as string[]),
            }}
          />
        </Space>
      </Modal>

      <WaveCreateModal
        open={waveOpen}
        outboundOrderIds={selectedOutboundIds}
        onClose={() => setWaveOpen(false)}
        onSuccess={handleWaveSuccess}
      />
    </>
  );
}
