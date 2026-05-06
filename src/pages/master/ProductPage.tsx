import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Typography, Table, Button, Input, Space, Tag, Modal, Form, Select,
  InputNumber, Row, Col, App, Empty, Divider, Tooltip, Descriptions, Alert,
} from 'antd';
import { PlusOutlined, SearchOutlined, StopOutlined, AppstoreAddOutlined, ThunderboltOutlined, QuestionCircleOutlined, CloudDownloadOutlined, CheckCircleFilled } from '@ant-design/icons';
import SafetyStockByProductSection from '@/components/SafetyStockByProductSection';
import { useQuery } from '@tanstack/react-query';
import { getAsnOrders, getAsnPreview, type AsnPreviewItem } from '@/api/inbound';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Product, OwnerType } from '@/types/product';
import { calcVolume, getSizeType } from '@/types/product';
import { SIZE_TYPE_LABEL } from '@/utils/labels';
import {
  useCreateProduct,
  useUpdateProduct,
  useDeactivateProduct,
  useProductGroups,
  useSuppliers,
  useSearchProductsAdvanced,
  useProductOptions,
} from '@/hooks/useMasterQuery';
import { suggestProductSku } from '@/api/product';
import { extractApiErrorMessage } from '@/utils/apiError';
import {
  ProductSearchFilterModal,
  ActiveConditionChips,
  useProductSearchStorage,
  EMPTY_CONDITION,
  type ProductSearchCondition,
} from '@/components/ProductSearch';
import ProductSearchOptions from '@/components/ProductSearch/ProductSearchOptions';

const { Title, Text } = Typography;

interface ProductFormValues {
  owner_type: OwnerType;
  supplier_id?: string | null;
  product_group_id: string;
  sku: string;
  barcode?: string;
  name: string;
  name_en?: string;
  standard_price: number;
  width: number;
  depth: number;
  height: number;
}

const OWNER_TYPE_OPTIONS: { label: string; value: OwnerType }[] = [
  { label: '자사 (OWN)', value: 'OWN' },
  { label: '입고처 (PARTNER)', value: 'PARTNER' },
];

/** 태그 컬러 — 상태만 강조, 나머지는 중립 회색 */
const neutralTag = { style: { background: '#f1f5f9', color: '#475569', border: 'none', fontWeight: 500 as const } };

export default function ProductPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: groups = [] } = useProductGroups();
  const { data: suppliers = [] } = useSuppliers();
  const supplierNameMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deactivateProduct = useDeactivateProduct();

  // ── 멀티필터 검색 + 서버 페이징 ──
  // 저장된 글로벌 조건 우선, URL ?search= 가 있으면 keyword로 덮어씀
  const searchStorage = useProductSearchStorage();
  const initialKeyword = searchParams.get('search') ?? '';
  const [condition, setCondition] = useState<ProductSearchCondition>(() => {
    if (initialKeyword) return { keyword: initialKeyword };
    return searchStorage.load() ?? EMPTY_CONDITION;
  });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const { data: searchPage, isLoading } = useSearchProductsAdvanced(condition, page, pageSize);
  const products = searchPage?.content ?? [];
  const totalElements = searchPage?.totalElements ?? 0;

  const applyCondition = (next: ProductSearchCondition) => {
    setCondition(next);
    searchStorage.save(next);
    setPage(0);
  };
  const clearCondition = () => {
    setCondition(EMPTY_CONDITION);
    searchStorage.clear();
    setPage(0);
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editForm] = Form.useForm();
  const [skuSuggesting, setSkuSuggesting] = useState(false);
  const [form] = Form.useForm<ProductFormValues>();
  const { message, modal } = App.useApp();

  // ── 옵션 매핑 (등록/수정 폼 공용) ──
  const [createOptionValueIds, setCreateOptionValueIds] = useState<string[]>([]);
  const [editOptionValueIds, setEditOptionValueIds] = useState<string[]>([]);
  /** 수정 진입 시 기존 옵션 매핑 로드해서 비교 기준으로 사용 (변경 없으면 PATCH에 안 보냄) */
  const { data: editProductOptions = [] } = useProductOptions(editProduct?.id ?? null);

  // ── 2-B: 발주서에서 가져오기 ──
  const [asnImportOpen, setAsnImportOpen] = useState(false);
  const [selectedAsnId, setSelectedAsnId] = useState<string | null>(null);

  const { data: asnList = [], isLoading: asnListLoading } = useQuery({
    queryKey: ['asn-orders'],
    queryFn: getAsnOrders,
    enabled: asnImportOpen && !selectedAsnId,
  });

  const { data: asnPreview, isLoading: asnPreviewLoading } = useQuery({
    queryKey: ['asn-preview', selectedAsnId],
    queryFn: () => getAsnPreview(selectedAsnId!),
    enabled: !!selectedAsnId,
  });

  const closeAsnImport = () => {
    setAsnImportOpen(false);
    setSelectedAsnId(null);
  };

  const pickFromAsn = (item: AsnPreviewItem) => {
    if (item.matched) return;
    closeAsnImport();
    form.resetFields();
    form.setFieldsValue({
      owner_type: 'OWN',
      sku: item.sku ?? '',
      name: item.product_name ?? '',
      standard_price: item.unit_price ?? 0,
      width: 0,
      height: 0,
      depth: 0,
    });
    setModalOpen(true);
  };

  const ownerType = Form.useWatch('owner_type', form);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      owner_type: 'OWN',
      width: 0,
      height: 0,
      depth: 0,
      standard_price: 0,
    });
    setCreateOptionValueIds([]);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await createProduct.mutateAsync({
        owner_type: values.owner_type,
        supplier_id: values.owner_type === 'PARTNER' ? (values.supplier_id ?? null) : null,
        product_group_id: values.product_group_id,
        sku: values.sku.trim(),
        barcode: values.barcode?.trim() || null,
        name: values.name.trim(),
        name_en: values.name_en?.trim() || null,
        unit: 'BOX',
        standard_price: values.standard_price,
        width: values.width,
        depth: values.depth,
        height: values.height,
        option_value_ids: createOptionValueIds,
      });
      message.success('상품이 추가되었습니다');
      setModalOpen(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '상품 생성 실패'));
    }
  };

  const openEdit = (record: Product) => {
    setEditProduct(record);
    setEditOptionValueIds([]); // useEffect로 로드되면 갱신
    editForm.setFieldsValue({
      product_group_id: record.product_group_id ?? undefined,
      name: record.name,
      barcode: record.barcode ?? '',
      standard_price: record.standard_price,
      width: record.width,
      depth: record.depth,
      height: record.height,
    });
  };
  const openDetail = (record: Product) => {
    setDetailProduct(record);
  };

  const handleUpdate = async () => {
    if (!editProduct) return;
    try {
      const values = await editForm.validateFields();
      // 옵션 변경 여부 비교 (set 동등성)
      const initialIds = [...editProductOptions.map((o) => o.optionValueId)].sort();
      const newIds = [...editOptionValueIds].sort();
      const optionsChanged =
        initialIds.length !== newIds.length ||
        initialIds.some((id, i) => id !== newIds[i]);
      await updateProduct.mutateAsync({
        id: editProduct.id,
        data: {
          ...values,
          ...(optionsChanged ? { option_value_ids: editOptionValueIds } : {}),
        },
      });
      message.success('상품이 수정되었습니다');
      setEditProduct(null);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '상품 수정 실패'));
    }
  };

  const handleDeactivate = (record: Product) => {
    modal.confirm({
      title: `${record.name} 비활성화?`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deactivateProduct.mutateAsync(record.id);
          message.success('비활성화됨');
        } catch (err) {
          message.error(extractApiErrorMessage(err, '비활성화 실패'));
        }
      },
    });
  };

  // 폼 watch — 부피 계산
  const formWidth = Form.useWatch('width', form) ?? 0;
  const formHeight = Form.useWatch('height', form) ?? 0;
  const formDepth = Form.useWatch('depth', form) ?? 0;
  const formVolume = formWidth * formHeight * formDepth;
  const formSizeType = getSizeType(formVolume);

  const columns: ColumnsType<Product> = [
    {
      title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160,
      render: (v: string) => <span style={{ color: '#0f172a', fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '상품명', dataIndex: 'name', key: 'name', width: 220,
      render: (v: string) => <span style={{ color: '#0f172a', fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '바코드',
      dataIndex: 'barcode',
      key: 'barcode',
      width: 150,
      render: (v?: string | null) =>
        v ? (
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>{v}</span>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: '그룹',
      dataIndex: 'product_group_name',
      key: 'product_group_name',
      width: 140,
      render: (v?: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: '카테고리',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (v: string) => v ? <Tag {...neutralTag}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: '소속',
      key: 'owner',
      width: 160,
      render: (_, r) => {
        if (r.owner_type === 'OWN') return <Tag {...neutralTag}>자사</Tag>;
        const name = r.supplier_id ? supplierNameMap.get(r.supplier_id) : null;
        return name
          ? <Tag {...neutralTag}>{name}</Tag>
          : <Tag {...neutralTag}>입고처 미지정</Tag>;
      },
    },
    {
      title: '단위', dataIndex: 'unit', key: 'unit', width: 60, align: 'center',
      render: (v: string) => <span style={{ color: '#94a3b8' }}>{v}</span>,
    },
    {
      title: '기준가',
      dataIndex: 'standard_price',
      key: 'standard_price',
      width: 110,
      align: 'right',
      render: (v: number) => `${(v ?? 0).toLocaleString()}원`,
    },
    {
      title: '크기',
      key: 'size',
      width: 140,
      align: 'center',
      render: (_, r) => {
        const vol = calcVolume(r);
        const st = getSizeType(vol);
        return (
          <Space size={4}>
            <Tag {...neutralTag}>{SIZE_TYPE_LABEL[st]}</Tag>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{vol.toLocaleString()}cm³</span>
          </Space>
        );
      },
    },
    {
      title: '활성',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 70,
      align: 'center',
      render: (v: boolean) => v ? <Tag color="green">활성</Tag> : <Tag color="default">비활성</Tag>,
    },
    {
      title: '',
      key: 'action',
      width: 40,
      align: 'center',
      render: (_, r) => (
        <RowActionMenu
          items={[
            { key: 'edit', label: '수정', onClick: () => openEdit(r) },
            { key: 'deactivate', label: '비활성화', icon: <StopOutlined />, danger: true, onClick: () => handleDeactivate(r), hidden: !r.is_active },
          ]}
        />
      ),
    },
  ];

  const canAddProduct = groups.length > 0;

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>상품 관리</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          상품은 상품 그룹에 속하며, 그룹이 카테고리에 연결됩니다.
        </Text>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <Button icon={<SearchOutlined />} onClick={() => setSearchModalOpen(true)}>
          상품 검색
        </Button>
        <Space size={8}>
          <Button icon={<AppstoreAddOutlined />} onClick={() => navigate('/master/product-groups')}>
            상품 그룹 관리
          </Button>
          <Button
            icon={<CloudDownloadOutlined />}
            onClick={() => setAsnImportOpen(true)}
            disabled={!canAddProduct}
          >
            발주서에서 가져오기
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!canAddProduct}>
            상품 추가
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 12 }}>
        <ActiveConditionChips
          condition={condition}
          onChange={applyCondition}
          onClearAll={clearCondition}
        />
      </div>

      <ProductSearchFilterModal
        open={searchModalOpen}
        onCancel={() => setSearchModalOpen(false)}
        enabledFilters={['name', 'sku', 'barcode', 'brand', 'supplier', 'category', 'ownerType', 'isActive', 'price', 'options']}
        onApply={applyCondition}
      />

      {!canAddProduct && products.length === 0 && !isLoading ? (
        <Empty
          description={
            <div>
              <div style={{ marginBottom: 8, fontSize: 14, color: '#1e2a3a' }}>
                먼저 상품 그룹이 필요합니다
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                상품은 그룹에 속해야 하므로, 먼저 "상품 그룹 관리" 에서 그룹을 하나 이상 생성해주세요.
              </div>
            </div>
          }
        >
          <Button type="primary" icon={<AppstoreAddOutlined />} onClick={() => navigate('/master/product-groups')}>
            상품 그룹 관리로 이동
          </Button>
        </Empty>
      ) : (
        <Table
          columns={columns}
          dataSource={products}
          rowKey="id"
          scroll={{ x: 1200 }}
          loading={isLoading}
          pagination={{
            current: page + 1,
            pageSize,
            total: totalElements,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t) => `총 ${t.toLocaleString()}건`,
            onChange: (p, s) => {
              setPage(p - 1);
              setPageSize(s);
            },
          }}
          onRow={(record) => ({
            onClick: () => openDetail(record),
            style: { cursor: 'pointer' },
          })}
        />
      )}

      <Modal
        title="상품 추가"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createProduct.isPending}
        okText="추가"
        cancelText="취소"
        width={680}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="owner_type" label="소속" rules={[{ required: true }]}>
                <Select options={OWNER_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="supplier_id"
                label="입고처"
                rules={ownerType === 'PARTNER' ? [{ required: true, message: 'PARTNER 소속은 입고처 필수' }] : []}
              >
                <Select
                  placeholder={ownerType === 'PARTNER' ? '입고처 선택' : 'OWN 일 때는 선택 불필요'}
                  disabled={ownerType !== 'PARTNER'}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="product_group_id"
            label="상품 그룹"
            rules={[{ required: true, message: '그룹을 선택하세요' }]}
            help="그룹이 카테고리를 결정합니다"
          >
            <Select
              placeholder="그룹 선택"
              showSearch
              optionFilterProp="label"
              options={groups.map((g) => ({
                label: `${g.name}${g.category_name ? ` (${g.category_name})` : ''}`,
                value: g.id,
              }))}
            />
          </Form.Item>
          <Divider style={{ margin: '4px 0 12px' }} />
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="sku"
                label={
                  <Space size={4}>
                    <span>SKU</span>
                    <Tooltip title="입고처 카탈로그/발주서에 있는 코드를 그대로 입력하거나, 자동 제안값을 사용하세요">
                      <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
                    </Tooltip>
                  </Space>
                }
                rules={[{ required: true }]}
              >
                <Input
                  placeholder="예: DISP_MONITOR-001 또는 입고처 코드 (LG-MNT-27 등)"
                  addonAfter={
                    <Tooltip title="상품 그룹 기준으로 자동 제안">
                      <Button
                        type="text"
                        size="small"
                        icon={<ThunderboltOutlined />}
                        loading={skuSuggesting}
                        onClick={async () => {
                          const groupId = form.getFieldValue('product_group_id');
                          if (!groupId) {
                            message.warning('상품 그룹을 먼저 선택하세요.');
                            return;
                          }
                          setSkuSuggesting(true);
                          try {
                            const sku = await suggestProductSku(groupId);
                            form.setFieldsValue({ sku });
                          } catch {
                            message.error('SKU 자동 제안에 실패했습니다.');
                          } finally {
                            setSkuSuggesting(false);
                          }
                        }}
                      >
                        자동 제안
                      </Button>
                    </Tooltip>
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="barcode" label="바코드">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="상품명" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name_en" label="영문 상품명">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="standard_price" label="기준가(원)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={100} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="width" label="가로(mm)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={10} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="depth" label="세로(mm)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={10} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="height" label="높이(mm)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={10} />
              </Form.Item>
            </Col>
          </Row>
          {formVolume > 0 && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
              부피: <Tag {...neutralTag}>{SIZE_TYPE_LABEL[formSizeType]}</Tag>
              {Math.round(formVolume / 1000).toLocaleString()} cm³
            </div>
          )}
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 8 }}
            message="안전재고는 창고별로 설정합니다"
            description={
              <span>
                상품 등록 후 <Link to="/master/safety-stocks" onClick={() => setModalOpen(false)}>[안전재고 관리]</Link> 메뉴에서 (상품 × 창고) 조합으로 등록하세요.
                미설정 창고는 재고 부족 알림 대상에서 제외됩니다.
              </span>
            }
          />
        </Form>
      </Modal>

      {/* 2-B: 발주서에서 가져오기 (2단계 모달) */}
      <Modal
        title={
          selectedAsnId
            ? `발주서 품목 — ${asnPreview?.asn_no ?? ''}`
            : '발주서 선택'
        }
        open={asnImportOpen}
        onCancel={closeAsnImport}
        footer={
          selectedAsnId ? (
            <Space>
              <Button onClick={() => setSelectedAsnId(null)}>← 발주서 목록</Button>
              <Button onClick={closeAsnImport}>닫기</Button>
            </Space>
          ) : (
            <Button onClick={closeAsnImport}>닫기</Button>
          )
        }
        width={760}
        destroyOnHidden
      >
        {!selectedAsnId ? (
          <Table
            size="small"
            rowKey="id"
            dataSource={asnList}
            loading={asnListLoading}
            pagination={{ pageSize: 8 }}
            onRow={(record) => ({
              onClick: () => setSelectedAsnId(record.id),
              style: { cursor: 'pointer' },
            })}
            columns={[
              { title: '발주번호', dataIndex: 'asn_no', key: 'asn_no', width: 160 },
              { title: '입고처', dataIndex: 'vendor_name', key: 'vendor_name', width: 160 },
              { title: '입고예정일', dataIndex: 'expected_date', key: 'expected_date', width: 120 },
              {
                title: '품목수',
                key: 'count',
                width: 80,
                align: 'center',
                render: (_, r) => r.items.length,
              },
            ]}
            locale={{ emptyText: '가져올 발주서가 없습니다' }}
          />
        ) : (
          <>
            <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
              <Text type="secondary">
                품목을 클릭하면 상품 등록 폼에 SKU·상품명·단가가 자동으로 채워집니다.
                이미 등록된 품목(<CheckCircleFilled style={{ color: '#16a34a' }} /> 등록됨)은 선택할 수 없습니다.
              </Text>
            </div>
            <Table
              size="small"
              rowKey={(r) => `${r.sku ?? ''}-${r.product_name ?? ''}`}
              dataSource={asnPreview?.items ?? []}
              loading={asnPreviewLoading}
              pagination={false}
              scroll={{ y: 360 }}
              columns={[
                {
                  title: '상태',
                  key: 'matched',
                  width: 90,
                  align: 'center',
                  render: (_, r: AsnPreviewItem) =>
                    r.matched ? (
                      <Tag color="green" icon={<CheckCircleFilled />}>등록됨</Tag>
                    ) : (
                      <Tag {...neutralTag}>미등록</Tag>
                    ),
                },
                { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160, render: (v) => v || '-' },
                { title: '상품명', dataIndex: 'product_name', key: 'product_name', render: (v) => v || '-' },
                { title: '수량', dataIndex: 'qty', key: 'qty', width: 70, align: 'right' },
                {
                  title: '단가',
                  dataIndex: 'unit_price',
                  key: 'unit_price',
                  width: 110,
                  align: 'right',
                  render: (v: number | null) => v != null ? `${v.toLocaleString()}원` : '-',
                },
                {
                  title: '',
                  key: 'pick',
                  width: 90,
                  align: 'center',
                  render: (_, r: AsnPreviewItem) => (
                    <Button
                      size="small"
                      type="link"
                      disabled={r.matched}
                      onClick={() => pickFromAsn(r)}
                    >
                      가져오기
                    </Button>
                  ),
                },
              ]}
            />
          </>
        )}
      </Modal>

      {/* ── 상품 상세 모달 ── */}
      <Modal
        title={`상품 상세 — ${detailProduct?.sku ?? ''}`}
        open={!!detailProduct}
        onCancel={() => setDetailProduct(null)}
        footer={[
          <Button key="close" onClick={() => setDetailProduct(null)}>
            닫기
          </Button>,
          <Button
            key="edit"
            type="primary"
            onClick={() => {
              if (!detailProduct) return;
              openEdit(detailProduct);
              setDetailProduct(null);
            }}
          >
            수정
          </Button>,
        ]}
        width={760}
      >
        {detailProduct && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginTop: 8 }}>
              <Descriptions.Item label="SKU">{detailProduct.sku}</Descriptions.Item>
              <Descriptions.Item label="상태">
                {detailProduct.is_active ? <Tag color="green">활성</Tag> : <Tag color="default">비활성</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="상품명" span={2}>{detailProduct.name}</Descriptions.Item>
              <Descriptions.Item label="바코드">{detailProduct.barcode || '-'}</Descriptions.Item>
              <Descriptions.Item label="소속">
                {detailProduct.owner_type === 'OWN'
                  ? '자사'
                  : (detailProduct.supplier_id ? (supplierNameMap.get(detailProduct.supplier_id) ?? '입고처 미지정') : '입고처 미지정')}
              </Descriptions.Item>
              <Descriptions.Item label="그룹">{detailProduct.product_group_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="카테고리">{detailProduct.category || '-'}</Descriptions.Item>
              <Descriptions.Item label="기준가">{(detailProduct.standard_price ?? 0).toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="가로(mm)">{(detailProduct.width ?? 0).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="세로(mm)">{(detailProduct.depth ?? 0).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="높이(mm)">{(detailProduct.height ?? 0).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="부피">{calcVolume(detailProduct).toLocaleString()}cm³</Descriptions.Item>
            </Descriptions>
            <Divider orientation="left" style={{ margin: '20px 0 12px', fontSize: 14 }}>창고별 안전재고</Divider>
            <SafetyStockByProductSection productId={detailProduct.id} />
            <Divider orientation="left" plain style={{ margin: '16px 0 8px', fontSize: 12, color: '#64748b' }}>
              옵션
            </Divider>
            <DetailOptionsView productId={detailProduct.id} />
          </>
        )}
      </Modal>

      {/* ── 상품 수정 모달 ── */}
      <Modal
        title={`상품 수정 — ${editProduct?.sku ?? ''}`}
        open={!!editProduct}
        onCancel={() => setEditProduct(null)}
        onOk={handleUpdate}
        confirmLoading={updateProduct.isPending}
        okText="저장"
        width={680}
      >
        {editProduct && (
          <>
            {/* 식별자 정보 (변경 불가) */}
            <Descriptions
              size="small"
              column={2}
              bordered
              style={{ marginBottom: 16 }}
              items={[
                { key: 'sku', label: 'SKU', children: editProduct.sku },
                {
                  key: 'owner',
                  label: '소속',
                  children:
                    editProduct.owner_type === 'OWN'
                      ? '자사'
                      : editProduct.supplier_id
                        ? (supplierNameMap.get(editProduct.supplier_id) ?? '입고처 미지정')
                        : '입고처 미지정',
                },
                { key: 'name_en', label: '영문명', children: editProduct.name_en || '-', span: 2 },
              ]}
            />

            <Form form={editForm} layout="vertical" style={{ marginTop: 8 }}>
              <Form.Item
                name="product_group_id"
                label="상품 그룹"
                rules={[{ required: true, message: '그룹을 선택하세요' }]}
                help="그룹을 변경하면 카테고리도 함께 이동합니다"
              >
                <Select
                  placeholder="그룹 선택"
                  showSearch
                  optionFilterProp="label"
                  options={groups.map((g) => ({
                    label: `${g.name}${g.category_name ? ` (${g.category_name})` : ''}`,
                    value: g.id,
                  }))}
                />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="name" label="상품명" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="barcode" label="바코드">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="standard_price" label="기준가(원)">
                    <InputNumber style={{ width: '100%' }} min={0} step={100} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="width" label="가로(mm)">
                    <InputNumber style={{ width: '100%' }} min={0} step={10} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="depth" label="세로(mm)">
                    <InputNumber style={{ width: '100%' }} min={0} step={10} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="height" label="높이(mm)">
                    <InputNumber style={{ width: '100%' }} min={0} step={10} />
                  </Form.Item>
                </Col>
              </Row>
              <EditVolumeHint form={editForm} />
              <Divider orientation="left" plain style={{ margin: '8px 0 12px', fontSize: 12, color: '#64748b' }}>
                옵션
              </Divider>
              <EditOptionsSection
                key={editProduct.id}
                productId={editProduct.id}
                onChange={setEditOptionValueIds}
              />
            </Form>
          </>
        )}
      </Modal>
    </>
  );
}

/** 수정 폼의 부피/사이즈 힌트 — 가로/세로/높이 watch */
function EditVolumeHint({ form }: { form: ReturnType<typeof Form.useForm>[0] }) {
  const w = (Form.useWatch('width', form) as number | undefined) ?? 0;
  const h = (Form.useWatch('height', form) as number | undefined) ?? 0;
  const d = (Form.useWatch('depth', form) as number | undefined) ?? 0;
  const vol = w * h * d;
  if (vol <= 0) return null;
  const sizeType = getSizeType(vol);
  return (
    <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
      부피: <Tag {...neutralTag}>{SIZE_TYPE_LABEL[sizeType]}</Tag>
      {Math.round(vol / 1000).toLocaleString()} cm³
    </div>
  );
}

/**
 * 수정 모달 옵션 섹션 — 부모는 editProduct.id를 key로 리마운트해서 진입 시마다 자체 초기화.
 * 1) productId의 기존 옵션 매핑을 1회 로드
 * 2) 사용자 선택값을 자체 state로 관리하면서 onChange로 부모에 통보
 */
function EditOptionsSection({
  productId,
  onChange,
}: {
  productId: string;
  onChange: (ids: string[]) => void;
}) {
  const { data: existing = [], isFetched } = useProductOptions(productId);
  const [valueIds, setValueIds] = useState<string[]>([]);
  const initRef = useRef(false);

  useEffect(() => {
    if (!isFetched || initRef.current) return;
    initRef.current = true;
    const ids = existing.map((o) => o.optionValueId);
    setValueIds(ids);
    onChange(ids);
    // onChange는 ref 안정성 보장 안 됨 — 1회 init만 트리거되면 충분
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetched]);

  return (
    <ProductSearchOptions
      value={valueIds}
      onChange={(next) => {
        setValueIds(next);
        onChange(next);
      }}
    />
  );
}

/** 상세 모달의 옵션 표시 — 옵션 타입별로 그룹화해서 칩 나열. */
function DetailOptionsView({ productId }: { productId: string }) {
  const { data: options = [], isFetching } = useProductOptions(productId);

  const grouped = useMemo(() => {
    const map = new Map<string, { typeName: string; values: string[] }>();
    options.forEach((o) => {
      const entry = map.get(o.optionTypeId);
      if (entry) {
        entry.values.push(o.optionValue);
      } else {
        map.set(o.optionTypeId, { typeName: o.optionTypeName || '옵션', values: [o.optionValue] });
      }
    });
    return Array.from(map.values());
  }, [options]);

  if (isFetching && options.length === 0) {
    return <Text type="secondary" style={{ fontSize: 12 }}>옵션 불러오는 중...</Text>;
  }
  if (grouped.length === 0) {
    return <Text type="secondary" style={{ fontSize: 12 }}>등록된 옵션이 없습니다</Text>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', rowGap: 6, columnGap: 12, alignItems: 'center' }}>
      {grouped.map((g, i) => (
        <FragmentRow key={i} typeName={g.typeName} values={g.values} />
      ))}
    </div>
  );
}

function FragmentRow({ typeName, values }: { typeName: string; values: string[] }) {
  return (
    <>
      <Text strong style={{ fontSize: 12 }}>{typeName}</Text>
      <Space size={[6, 6]} wrap>
        {values.map((v, i) => (
          <Tag key={i} color="blue">{v}</Tag>
        ))}
      </Space>
    </>
  );
}
