import { useMemo, useState } from 'react';
import {
  Table, Button, Space, Tag, Typography, Modal, Form, InputNumber, Select, App, Empty,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useProducts } from '@/hooks/useMasterQuery';
import {
  useSafetyStocksByWarehouse,
  useUpsertSafetyStock,
  useDeleteSafetyStock,
} from '@/hooks/useSafetyStockQuery';
import type { SafetyStock } from '@/types/safetyStock';
import { extractApiErrorMessage } from '@/utils/apiError';

const { Text } = Typography;

interface CreateValues {
  product_id: string;
  min_stock_qty: number;
}

/** 한 창고의 상품별 안전재고 — 설정된 (상품) 만 표시. */
export default function WarehouseSafetyStockTab({ warehouseId }: { warehouseId: string }) {
  const { data: settings = [], isLoading } = useSafetyStocksByWarehouse(warehouseId);
  const { data: products = [] } = useProducts();
  const upsert = useUpsertSafetyStock();
  const remove = useDeleteSafetyStock();
  const { message, modal } = App.useApp();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SafetyStock | null>(null);
  const [createForm] = Form.useForm<CreateValues>();
  const [editForm] = Form.useForm<{ min_stock_qty: number }>();

  const settledProductIds = useMemo(
    () => new Set(settings.map((s) => s.product_id)),
    [settings],
  );

  /** 이 창고에 아직 미설정인 상품만 추가 가능 */
  const productOptions = products
    .filter((p) => p.is_active && !settledProductIds.has(p.id))
    .map((p) => ({ label: `${p.name} (${p.sku})`, value: p.id }));

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ min_stock_qty: 0 });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    try {
      const v = await createForm.validateFields();
      await upsert.mutateAsync({
        productId: v.product_id,
        warehouseId,
        minStockQty: v.min_stock_qty,
      });
      message.success('안전재고가 등록되었습니다.');
      setCreateOpen(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '등록 실패'));
    }
  };

  const openEdit = (record: SafetyStock) => {
    setEditTarget(record);
    editForm.setFieldsValue({ min_stock_qty: record.min_stock_qty });
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      const v = await editForm.validateFields();
      await upsert.mutateAsync({
        productId: editTarget.product_id,
        warehouseId,
        minStockQty: v.min_stock_qty,
      });
      message.success('안전재고가 수정되었습니다.');
      setEditTarget(null);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '수정 실패'));
    }
  };

  const handleDelete = (record: SafetyStock) => {
    modal.confirm({
      title: `${record.product_name} 의 안전재고 설정을 삭제할까요?`,
      content: (
        <Text type="secondary" style={{ fontSize: 12 }}>
          삭제하면 이 창고에서 해당 상품의 재고 부족 알림이 발생하지 않습니다.
        </Text>
      ),
      okButtonProps: { danger: true },
      okText: '삭제',
      cancelText: '취소',
      onOk: async () => {
        try {
          await remove.mutateAsync({ productId: record.product_id, warehouseId });
          message.success('삭제되었습니다.');
        } catch (err) {
          message.error(extractApiErrorMessage(err, '삭제 실패'));
        }
      },
    });
  };

  const columns: ColumnsType<SafetyStock> = [
    {
      title: '상품', dataIndex: 'product_name', key: 'product_name',
      render: (v: string) => <span style={{ color: '#0f172a', fontWeight: 500 }}>{v}</span>,
    },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
    {
      title: '안전재고', dataIndex: 'min_stock_qty', key: 'min_stock_qty', width: 130, align: 'right',
      render: (v: number) => <Text strong>{v.toLocaleString()}</Text>,
    },
    {
      title: '작업', key: 'action', width: 180, align: 'center',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openEdit(r)}>수정</Button>
          <Button size="small" type="link" danger onClick={() => handleDelete(r)}>삭제</Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          이 창고에서 안전재고가 설정된 상품 목록입니다. 미설정 상품은 알림 대상에서 제외됩니다.
        </Text>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          disabled={productOptions.length === 0}
        >
          추가
        </Button>
      </div>

      {settings.length === 0 && !isLoading ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="아직 설정된 안전재고가 없습니다"
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            disabled={productOptions.length === 0}
          >
            안전재고 추가
          </Button>
        </Empty>
      ) : (
        <Table
          size="small"
          columns={columns}
          dataSource={settings}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
        />
      )}

      <Modal
        title="안전재고 추가"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={upsert.isPending}
        okText="등록"
        cancelText="취소"
        width={460}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="product_id" label="상품" rules={[{ required: true }]}>
            <Select
              placeholder="상품 선택"
              showSearch
              optionFilterProp="label"
              options={productOptions}
              notFoundContent="추가 가능한 상품이 없습니다 (모두 이미 설정됨)"
            />
          </Form.Item>
          <Form.Item
            name="min_stock_qty"
            label="안전재고"
            rules={[{ required: true, message: '안전재고를 입력하세요' }]}
            tooltip="가용재고가 이 값 이하가 되면 재고 부족 알림이 발생합니다"
          >
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          editTarget
            ? `안전재고 수정 — ${editTarget.product_name}`
            : ''
        }
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        onOk={handleEdit}
        confirmLoading={upsert.isPending}
        okText="저장"
        cancelText="취소"
        width={400}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="상품">
            <Tag>{editTarget?.sku}</Tag> {editTarget?.product_name}
          </Form.Item>
          <Form.Item
            name="min_stock_qty"
            label="안전재고"
            rules={[{ required: true, message: '안전재고를 입력하세요' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
