import { useEffect, useMemo, useState } from 'react';
import { Modal, Select, Table, Tag, App, Spin, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { getOutboundItems } from '@/api/order';
import { createWave } from '@/api/pickingList';
import { getUsers } from '@/api/settings';
import type { PickingList } from '@/types/order';
import type { UserListItem } from '@/types/user';

/**
 * 공용 웨이브 생성 모달
 * - 여러 출고지시서를 묶어 웨이브 피킹리스트를 생성한다.
 * - 담당자를 직접 고르면 수동 배정, 비워두면 백엔드가 작업 부하 기준으로 자동 배정한다.
 * - 백엔드 WaveCreateReqDto: { outboundOrderIds, assignments: Map<productId, userId> }
 * - 모달 오픈 시 outboundOrderIds 에 포함된 모든 상품을 한 번에 로딩하여 중복 제거 후 표시.
 */

export interface WaveCreateModalProps {
  open: boolean;
  outboundOrderIds: string[];
  onClose: () => void;
  onSuccess?: (picking: PickingList) => void;
}

interface ProductRow {
  product_id: string;
  sku: string;
  product_name: string;
  /** 선택된 출고지시서에 포함된 이 상품의 총 지시수량 */
  total_qty: number;
}

export default function WaveCreateModal({ open, outboundOrderIds, onClose, onSuccess }: WaveCreateModalProps) {
  const { message } = App.useApp();
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [singleAssignee, setSingleAssignee] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  /** 출고지시서가 1건일 때는 단일 담당자 UI, 2건 이상일 때는 상품별 배정 UI */
  const isSingleOrder = outboundOrderIds.length === 1;
  const outboundOrderKey = useMemo(() => outboundOrderIds.join(','), [outboundOrderIds]);

  // 선택된 출고지시서의 상품 수집
  const { data: productRows = [], isLoading: loadingProducts } = useQuery<ProductRow[]>({
    queryKey: ['wave-preview', outboundOrderIds],
    enabled: open && outboundOrderIds.length > 0,
    queryFn: async () => {
      const merged = new Map<string, ProductRow>();
      for (const oid of outboundOrderIds) {
        try {
          const items = await getOutboundItems(oid);
          items.forEach((it) => {
            if (!it.product_id) return;
            const cur = merged.get(it.product_id);
            if (cur) cur.total_qty += it.ordered_qty;
            else merged.set(it.product_id, {
              product_id: it.product_id,
              sku: it.sku,
              product_name: it.product_name,
              total_qty: it.ordered_qty,
            });
          });
        } catch {
          // 개별 실패는 무시
        }
      }
      return Array.from(merged.values());
    },
  });

  // 작업자 목록 (OPERATOR 역할만)
  const { data: allUsers = [], isLoading: loadingUsers } = useQuery<UserListItem[]>({
    queryKey: ['users-for-wave'],
    enabled: open,
    queryFn: getUsers,
  });
  const operators = useMemo(
    () => allUsers.filter((u) => u.roleCode === 'OPERATOR' || u.roleCode === 'MANAGER'),
    [allUsers],
  );

  // 모달 재오픈 시 상태 초기화
  useEffect(() => {
    if (!open) return;
    setAssignments({});
    setSingleAssignee(undefined);
  }, [open, outboundOrderKey]);

  const handleOk = async () => {
    if (productRows.length === 0) {
      message.warning('선택된 출고지시서에 상품이 없습니다.');
      return;
    }
    // 단일 지시서: 담당자를 고른 경우에만 모든 productId 에 일괄 수동 배정한다.
    // 선택하지 않으면 백엔드가 자동 배정한다.
    const finalAssignments: Record<string, string> = isSingleOrder
      ? singleAssignee
        ? Object.fromEntries(productRows.map((r) => [r.product_id, singleAssignee]))
        : {}
      : assignments;

    setSubmitting(true);
    try {
      const { picking } = await createWave({
        outboundOrderIds,
        assignments: finalAssignments,
      });
      message.success(`웨이브 피킹 ${picking.picking_no} 생성 완료`);
      onSuccess?.(picking);
      onClose();
    } catch (e) {
      const detail = e instanceof Error ? e.message : '웨이브 생성 실패';
      message.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const baseColumns: ColumnsType<ProductRow> = [
    {
      title: '상품', key: 'product', width: 260,
      render: (_, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{r.product_name}</div>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.sku}</span>
        </div>
      ),
    },
    {
      title: '총 지시수량', dataIndex: 'total_qty', key: 'total_qty', width: 110, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600, color: '#1677ff' }}>{v.toLocaleString()}</span>,
    },
  ];

  const assigneeColumn: ColumnsType<ProductRow>[number] = {
    title: '담당자', key: 'assignee', width: 260,
    render: (_, r) => (
      <Select
        placeholder="담당자 선택"
        allowClear
        style={{ width: '100%' }}
        value={assignments[r.product_id]}
        onChange={(v) => setAssignments((prev) => ({ ...prev, [r.product_id]: v }))}
        loading={loadingUsers}
        options={operators.map((u) => ({
          label: `${u.name} (${u.roleName ?? u.roleCode ?? '-'})`,
          value: u.id,
        }))}
        showSearch
        optionFilterProp="label"
      />
    ),
  };

  // 단일 지시서면 담당자 컬럼 제거(상단 단일 Select 로 일괄 배정)
  const columns: ColumnsType<ProductRow> = isSingleOrder ? baseColumns : [...baseColumns, assigneeColumn];

  return (
    <Modal
      title={isSingleOrder ? '피킹 리스트 생성 — 담당자 지정' : '웨이브 생성 — 상품별 담당자 배정'}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={submitting}
      okText={isSingleOrder ? '피킹 리스트 생성' : '웨이브 생성'}
      cancelText="취소"
      width={780}
      okButtonProps={{ disabled: productRows.length === 0 }}
    >
      <div style={{ marginBottom: 10, fontSize: 12, color: '#64748b' }}>
        {isSingleOrder ? (
          <>선택된 출고지시서 <Tag color="blue" style={{ margin: 0 }}>1건</Tag> 의 담당자를 선택하거나, 비워두면 자동 배정됩니다.</>
        ) : (
          <>선택된 출고지시서 <Tag color="blue" style={{ margin: 0 }}>{outboundOrderIds.length}건</Tag>
            에서 추출된 상품별 담당자를 선택할 수 있습니다. 비워둔 상품은 자동 배정됩니다.</>
        )}
      </div>
      {isSingleOrder && (
        <div style={{ marginBottom: 12 }}>
          <Select
            placeholder="담당자 선택"
            allowClear
            style={{ width: '100%' }}
            value={singleAssignee}
            onChange={(v) => setSingleAssignee(v)}
            loading={loadingUsers}
            options={operators.map((u) => ({
              label: `${u.name} (${u.roleName ?? u.roleCode ?? '-'})`,
              value: u.id,
            }))}
            showSearch
            optionFilterProp="label"
          />
        </div>
      )}
      {loadingProducts ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin /> <span style={{ marginLeft: 8, color: '#94a3b8' }}>상품 목록을 불러오는 중…</span>
        </div>
      ) : productRows.length === 0 ? (
        <Empty description="상품이 없습니다" />
      ) : (
        <Table
          columns={columns}
          dataSource={productRows}
          rowKey="product_id"
          size="small"
          pagination={false}
          scroll={{ y: 400 }}
        />
      )}
    </Modal>
  );
}
