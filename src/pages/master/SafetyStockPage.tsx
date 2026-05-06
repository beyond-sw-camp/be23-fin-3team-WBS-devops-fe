import { useMemo, useState } from 'react';
import {
  Typography, Table, Button, Input, Space, Tag, Modal, Form, Select,
  InputNumber, App, Empty, Checkbox, Alert,
} from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import RowActionMenu from '@/components/RowActionMenu';
import { useProducts } from '@/hooks/useMasterQuery';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import {
  useSafetyStocksByClient,
  useUpsertSafetyStock,
  useDeleteSafetyStock,
  useUpsertSafetyStockBulk,
} from '@/hooks/useSafetyStockQuery';
import type { SafetyStock } from '@/types/safetyStock';
import { extractApiErrorMessage } from '@/utils/apiError';

const { Title, Text } = Typography;

interface FormValues {
  product_id: string;
  warehouse_id?: string;
  min_stock_qty: number;
  apply_all_warehouses: boolean;
}

export default function SafetyStockPage() {
  const { data: settings = [], isLoading } = useSafetyStocksByClient();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const upsert = useUpsertSafetyStock();
  const upsertBulk = useUpsertSafetyStockBulk();
  const remove = useDeleteSafetyStock();
  const { message, modal } = App.useApp();

  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [warehouseFilter, setWarehouseFilter] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SafetyStock | null>(null);
  const [createForm] = Form.useForm<FormValues>();
  const [editForm] = Form.useForm<{ min_stock_qty: number }>();

  const activeWarehouses = useMemo(
    () => warehouses.filter((w) => w.is_active),
    [warehouses],
  );

  const filtered = useMemo(() => {
    let list = settings;
    if (productFilter) list = list.filter((s) => s.product_id === productFilter);
    if (warehouseFilter) list = list.filter((s) => s.warehouse_id === warehouseFilter);
    if (search) {
      const kw = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.sku.toLowerCase().includes(kw) ||
          s.product_name.toLowerCase().includes(kw) ||
          s.warehouse_name.toLowerCase().includes(kw),
      );
    }
    return list;
  }, [settings, productFilter, warehouseFilter, search]);

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ min_stock_qty: 0, apply_all_warehouses: false });
    setCreateOpen(true);
  };

  const applyAllWatched = Form.useWatch('apply_all_warehouses', createForm);

  const handleCreate = async () => {
    try {
      const v = await createForm.validateFields();
      if (v.apply_all_warehouses) {
        const wids = activeWarehouses.map((w) => w.id);
        if (wids.length === 0) {
          message.warning('적용할 활성 창고가 없습니다.');
          return;
        }
        const res = await upsertBulk.mutateAsync({
          productId: v.product_id,
          warehouseIds: wids,
          minStockQty: v.min_stock_qty,
        });
        if (res.failed.length === 0) {
          message.success(`${res.ok.length}개 창고에 안전재고를 적용했습니다.`);
        } else {
          message.warning(
            `성공 ${res.ok.length}건 / 실패 ${res.failed.length}건. 실패한 창고는 다시 시도해주세요.`,
          );
        }
      } else {
        if (!v.warehouse_id) {
          message.warning('창고를 선택하세요.');
          return;
        }
        await upsert.mutateAsync({
          productId: v.product_id,
          warehouseId: v.warehouse_id,
          minStockQty: v.min_stock_qty,
        });
        message.success('안전재고가 등록되었습니다.');
      }
      setCreateOpen(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '안전재고 등록 실패'));
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
        warehouseId: editTarget.warehouse_id,
        minStockQty: v.min_stock_qty,
      });
      message.success('안전재고가 수정되었습니다.');
      setEditTarget(null);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '안전재고 수정 실패'));
    }
  };

  const handleDelete = (record: SafetyStock) => {
    modal.confirm({
      title: '안전재고 설정을 삭제할까요?',
      content: (
        <span>
          {record.product_name} · {record.warehouse_name}
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            삭제하면 이 (상품 × 창고) 조합은 재고 부족 알림 대상에서 제외됩니다.
          </Text>
        </span>
      ),
      okButtonProps: { danger: true },
      okText: '삭제',
      cancelText: '취소',
      onOk: async () => {
        try {
          await remove.mutateAsync({
            productId: record.product_id,
            warehouseId: record.warehouse_id,
          });
          message.success('삭제되었습니다.');
        } catch (err) {
          message.error(extractApiErrorMessage(err, '삭제 실패'));
        }
      },
    });
  };

  const columns: ColumnsType<SafetyStock> = [
    {
      title: '상품', dataIndex: 'product_name', key: 'product_name', width: 220,
      render: (v: string) => <span style={{ color: '#0f172a', fontWeight: 500 }}>{v}</span>,
    },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 160 },
    {
      title: '안전재고', dataIndex: 'min_stock_qty', key: 'min_stock_qty', width: 110, align: 'right',
      render: (v: number) => <Text strong>{v.toLocaleString()}</Text>,
    },
    {
      title: '', key: 'action', width: 40, align: 'center',
      render: (_, r) => (
        <RowActionMenu
          items={[
            { key: 'edit', label: '수정', onClick: () => openEdit(r) },
            { key: 'delete', label: '삭제', danger: true, onClick: () => handleDelete(r) },
          ]}
        />
      ),
    },
  ];

  const productOptions = products
    .filter((p) => p.is_active)
    .map((p) => ({ label: `${p.name} (${p.sku})`, value: p.id }));
  const warehouseOptions = activeWarehouses.map((w) => ({ label: w.name, value: w.id }));

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>안전재고 관리</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          상품 × 창고 조합별로 안전재고를 설정합니다. 미설정 조합은 재고 부족 알림 대상에서 제외됩니다.
        </Text>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <Space size={8} wrap>
          <Select
            placeholder="상품 (전체)"
            allowClear
            style={{ width: 220 }}
            showSearch
            optionFilterProp="label"
            value={productFilter}
            onChange={(v) => setProductFilter(v ?? null)}
            options={productOptions}
          />
          <Select
            placeholder="창고 (전체)"
            allowClear
            style={{ width: 180 }}
            value={warehouseFilter}
            onChange={(v) => setWarehouseFilter(v ?? null)}
            options={warehouseOptions}
          />
          <Input
            placeholder="SKU / 상품명 / 창고명 검색"
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240 }}
          />
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          disabled={products.length === 0 || activeWarehouses.length === 0}
        >
          추가
        </Button>
      </div>

      {settings.length === 0 && !isLoading ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <div style={{ marginBottom: 8 }}>아직 설정된 안전재고가 없습니다</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                상품 × 창고 조합을 추가하면 가용재고가 안전재고 이하일 때 알림이 발생합니다.
              </Text>
            </div>
          }
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            disabled={products.length === 0 || activeWarehouses.length === 0}
          >
            안전재고 추가
          </Button>
        </Empty>
      ) : (
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          scroll={{ x: 900 }}
          loading={isLoading}
        />
      )}

      <Modal
        title="안전재고 추가"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={upsert.isPending || upsertBulk.isPending}
        okText="등록"
        cancelText="취소"
        width={520}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="product_id" label="상품" rules={[{ required: true }]}>
            <Select
              placeholder="상품 선택"
              showSearch
              optionFilterProp="label"
              options={productOptions}
            />
          </Form.Item>
          <Form.Item name="apply_all_warehouses" valuePropName="checked">
            <Checkbox>전 창고 동일값 일괄 적용</Checkbox>
          </Form.Item>
          {!applyAllWatched && (
            <Form.Item name="warehouse_id" label="창고" rules={[{ required: true, message: '창고를 선택하세요' }]}>
              <Select placeholder="창고 선택" options={warehouseOptions} />
            </Form.Item>
          )}
          <Form.Item
            name="min_stock_qty"
            label="안전재고"
            rules={[{ required: true, message: '안전재고를 입력하세요' }]}
            tooltip="가용재고가 이 값 이하가 되면 재고 부족 알림이 발생합니다"
          >
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          {applyAllWatched && (
            <Alert
              type="info"
              showIcon
              message={`활성 창고 ${activeWarehouses.length}개 모두에 같은 값으로 적용됩니다.`}
              description="이미 설정된 (상품 × 창고) 는 입력값으로 덮어씁니다."
            />
          )}
        </Form>
      </Modal>

      <Modal
        title={editTarget ? `안전재고 수정 — ${editTarget.product_name} / ${editTarget.warehouse_name}` : ''}
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        onOk={handleEdit}
        confirmLoading={upsert.isPending}
        okText="저장"
        cancelText="취소"
        width={420}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="상품">
            <Tag>{editTarget?.sku}</Tag> {editTarget?.product_name}
          </Form.Item>
          <Form.Item label="창고">
            <Text>{editTarget?.warehouse_name}</Text>
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
