import { useMemo, useState } from 'react';
import { Table, Button, Space, Tag, Typography, Modal, Form, InputNumber, App, Alert } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import {
  useSafetyStocksByProduct,
  useUpsertSafetyStock,
  useDeleteSafetyStock,
} from '@/hooks/useSafetyStockQuery';
import { extractApiErrorMessage } from '@/utils/apiError';

const { Text } = Typography;

interface Row {
  warehouse_id: string;
  warehouse_name: string;
  /** 미설정이면 null */
  min_stock_qty: number | null;
}

/** 한 상품의 창고별 안전재고 — 모든 활성 창고를 보여주고, 미설정 창고는 [+ 설정]. */
export default function SafetyStockByProductSection({ productId }: { productId: string }) {
  const { data: warehouses = [] } = useWarehouses();
  const { data: settings = [], isLoading } = useSafetyStocksByProduct(productId);
  const upsert = useUpsertSafetyStock();
  const remove = useDeleteSafetyStock();
  const { message, modal } = App.useApp();

  const [editTarget, setEditTarget] = useState<Row | null>(null);
  const [form] = Form.useForm<{ min_stock_qty: number }>();

  const rows: Row[] = useMemo(() => {
    const settingByWh = new Map(settings.map((s) => [s.warehouse_id, s.min_stock_qty]));
    return warehouses
      .filter((w) => w.is_active)
      .map((w) => ({
        warehouse_id: w.id,
        warehouse_name: w.name,
        min_stock_qty: settingByWh.has(w.id) ? settingByWh.get(w.id)! : null,
      }));
  }, [warehouses, settings]);

  const openSet = (row: Row) => {
    setEditTarget(row);
    form.setFieldsValue({ min_stock_qty: row.min_stock_qty ?? 0 });
  };

  const handleSave = async () => {
    if (!editTarget) return;
    try {
      const v = await form.validateFields();
      await upsert.mutateAsync({
        productId,
        warehouseId: editTarget.warehouse_id,
        minStockQty: v.min_stock_qty,
      });
      message.success('안전재고가 저장되었습니다.');
      setEditTarget(null);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '저장 실패'));
    }
  };

  const handleDelete = (row: Row) => {
    modal.confirm({
      title: `${row.warehouse_name} 의 안전재고 설정을 삭제할까요?`,
      content: (
        <Text type="secondary" style={{ fontSize: 12 }}>
          삭제하면 이 창고의 재고 부족 알림 대상에서 제외됩니다.
        </Text>
      ),
      okButtonProps: { danger: true },
      okText: '삭제',
      cancelText: '취소',
      onOk: async () => {
        try {
          await remove.mutateAsync({ productId, warehouseId: row.warehouse_id });
          message.success('삭제되었습니다.');
        } catch (err) {
          message.error(extractApiErrorMessage(err, '삭제 실패'));
        }
      },
    });
  };

  const columns: ColumnsType<Row> = [
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name' },
    {
      title: '안전재고', dataIndex: 'min_stock_qty', key: 'min_stock_qty', width: 130, align: 'right',
      render: (v: number | null) =>
        v == null
          ? <Tag color="default">미설정</Tag>
          : <Text strong>{v.toLocaleString()}</Text>,
    },
    {
      title: '작업', key: 'action', width: 180, align: 'center',
      render: (_, r) =>
        r.min_stock_qty == null ? (
          <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => openSet(r)}>
            설정
          </Button>
        ) : (
          <Space size={4}>
            <Button size="small" type="link" onClick={() => openSet(r)}>수정</Button>
            <Button size="small" type="link" danger onClick={() => handleDelete(r)}>삭제</Button>
          </Space>
        ),
    },
  ];

  return (
    <>
      <Table
        size="small"
        columns={columns}
        dataSource={rows}
        rowKey="warehouse_id"
        loading={isLoading}
        pagination={false}
      />
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 8 }}
        message="미설정 창고는 재고 부족 알림이 발생하지 않습니다."
      />

      <Modal
        title={
          editTarget
            ? `${editTarget.warehouse_name} — 안전재고 ${editTarget.min_stock_qty == null ? '설정' : '수정'}`
            : ''
        }
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        onOk={handleSave}
        confirmLoading={upsert.isPending}
        okText="저장"
        cancelText="취소"
        width={400}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="min_stock_qty"
            label="안전재고"
            rules={[{ required: true, message: '안전재고를 입력하세요' }]}
            tooltip="가용재고가 이 값 이하가 되면 재고 부족 알림이 발생합니다"
          >
            <InputNumber style={{ width: '100%' }} min={0} autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
