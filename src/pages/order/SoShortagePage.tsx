import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Card, Tag, Space, Empty, Segmented, Button, Tooltip, Collapse,
} from 'antd';
import {
  StopOutlined, ThunderboltOutlined, RightOutlined,
  AppstoreOutlined, FileTextOutlined,
} from '@ant-design/icons';
import {
  useSoShortageStore,
  type SoShortagePayload,
  type SoShortageItem,
} from '@/stores/soShortageStore';

const { Title, Text } = Typography;

type ViewMode = 'by-product' | 'by-so';

interface ProductGroup {
  productId: string;
  productName: string;
  sku: string;
  totalShortage: number;
  affectedSos: Array<{
    salesOrderId: string;
    soNo: string;
    storeName: string;
    scheduledDate: string;
    shortageQty: number;
    requiredQty: number;
    availableQty: number;
  }>;
}

export default function SoShortagePage() {
  const navigate = useNavigate();
  const shortagesMap = useSoShortageStore((s) => s.shortages);
  const [viewMode, setViewMode] = useState<ViewMode>('by-product');

  // Map → 안정된 배열 (정렬: 출고예정일 ASC)
  const shortages: SoShortagePayload[] = useMemo(() => {
    return Array.from(shortagesMap.values())
      .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''));
  }, [shortagesMap]);

  // 품목별 그룹핑 — 같은 상품이 여러 SO 에서 부족하면 합산
  const productGroups: ProductGroup[] = useMemo(() => {
    const map = new Map<string, ProductGroup>();
    for (const so of shortages) {
      for (const item of so.items) {
        const existing = map.get(item.productId);
        const affected = {
          salesOrderId: so.salesOrderId,
          soNo: so.soNo,
          storeName: so.storeName,
          scheduledDate: so.scheduledDate,
          shortageQty: item.shortageQty,
          requiredQty: item.requiredQty,
          availableQty: item.availableQty,
        };
        if (existing) {
          existing.totalShortage += item.shortageQty;
          existing.affectedSos.push(affected);
        } else {
          map.set(item.productId, {
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            totalShortage: item.shortageQty,
            affectedSos: [affected],
          });
        }
      }
    }
    // 부족 큰 순
    return Array.from(map.values()).sort((a, b) => b.totalShortage - a.totalShortage);
  }, [shortages]);

  const goManualInboundForProduct = (item: { productId: string; productName: string; sku: string; shortageQty: number }) => {
    // 기존 ATP/저재고 알림에서 쓰던 prefill 패턴 그대로 재사용
    navigate('/order/inbound', {
      state: {
        prefillManualInbound: {
          source: 'atp',
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          requestedQty: item.shortageQty,
        },
      },
    });
  };

  return (
    <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Space size={10} align="center">
          <StopOutlined style={{ fontSize: 22, color: '#dc2626' }} />
          <Title level={4} style={{ margin: 0 }}>출고 불가 수주</Title>
          <Tag color="red" style={{ fontSize: 12, fontWeight: 600 }}>{shortages.length}건</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>ATP 부족 — 실시간 감지</Text>
        </Space>
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { label: <Space size={6}><AppstoreOutlined />품목별</Space>, value: 'by-product' },
            { label: <Space size={6}><FileTextOutlined />SO별</Space>, value: 'by-so' },
          ]}
        />
      </div>

      {shortages.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '48px 0', border: '1px solid #e5e7eb' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ fontSize: 13 }}>
                현재 출고 불가 수주가 없습니다. <br />
                <Text type="secondary" style={{ fontSize: 12 }}>새로 발생하면 실시간으로 여기에 표시됩니다.</Text>
              </span>
            }
          />
        </Card>
      ) : viewMode === 'by-product' ? (
        <ProductView groups={productGroups} onUrgentInbound={goManualInboundForProduct} navigate={navigate} />
      ) : (
        <SoView shortages={shortages} onUrgentInbound={goManualInboundForProduct} navigate={navigate} />
      )}
    </div>
  );
}

// ============================================================
// 품목별 보기 — 합산된 부족 + 영향 SO 목록 펼치기
// ============================================================
function ProductView({
  groups, onUrgentInbound, navigate,
}: {
  groups: ProductGroup[];
  onUrgentInbound: (item: { productId: string; productName: string; sku: string; shortageQty: number }) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map((g) => (
        <Card
          key={g.productId}
          size="small"
          style={{ border: '1px solid #fecaca' }}
          styles={{ body: { padding: 14 } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Space size={8} align="center">
                <Text strong style={{ fontSize: 14, color: '#0f172a' }}>{g.productName}</Text>
                <Text type="secondary" style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }}>{g.sku}</Text>
              </Space>
              <div style={{ marginTop: 4 }}>
                <Space size={12}>
                  <span>
                    <Text type="secondary" style={{ fontSize: 11 }}>영향 SO</Text>
                    <Text strong style={{ fontSize: 13, marginLeft: 4 }}>{g.affectedSos.length}건</Text>
                  </span>
                  <span>
                    <Text type="secondary" style={{ fontSize: 11 }}>총 부족</Text>
                    <Text strong style={{ fontSize: 14, marginLeft: 4, color: '#dc2626' }}>
                      {g.totalShortage.toLocaleString()}개
                    </Text>
                  </span>
                </Space>
              </div>
            </div>
            <Tooltip title="이 상품을 부족 수량만큼 입고지시서로 즉시 생성합니다 (수동 입고 모달이 자동으로 열려요)">
              <Button
                type="primary"
                danger
                icon={<ThunderboltOutlined />}
                onClick={() =>
                  onUrgentInbound({
                    productId: g.productId,
                    productName: g.productName,
                    sku: g.sku,
                    shortageQty: g.totalShortage,
                  })
                }
              >
                긴급 입고 ({g.totalShortage.toLocaleString()})
              </Button>
            </Tooltip>
          </div>

          <Collapse
            ghost
            size="small"
            style={{ marginTop: 8 }}
            items={[
              {
                key: 'sos',
                label: <Text type="secondary" style={{ fontSize: 12 }}>영향 받는 수주서 보기</Text>,
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {g.affectedSos.map((s) => (
                      <div
                        key={`${s.salesOrderId}-${g.productId}`}
                        style={{
                          padding: '8px 10px',
                          background: '#fef2f2',
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Space size={8}>
                            <Text strong style={{ fontSize: 12 }}>{s.soNo}</Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>·</Text>
                            <Text style={{ fontSize: 12 }}>{s.storeName}</Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>·</Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>출고예정 {s.scheduledDate}</Text>
                          </Space>
                        </div>
                        <Space size={12}>
                          <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                            필요 {s.requiredQty} / 가용 {s.availableQty}
                          </Text>
                          <Text strong style={{ color: '#dc2626' }}>{s.shortageQty}개 부족</Text>
                          <Button
                            size="small"
                            type="link"
                            onClick={() => navigate(`/order/sales-orders/${s.salesOrderId}/progress`)}
                            icon={<RightOutlined />}
                            iconPosition="end"
                          >
                            진행률
                          </Button>
                        </Space>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// SO별 보기 — SO 카드 + 부족 품목 리스트
// ============================================================
function SoView({
  shortages, onUrgentInbound, navigate,
}: {
  shortages: SoShortagePayload[];
  onUrgentInbound: (item: { productId: string; productName: string; sku: string; shortageQty: number }) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {shortages.map((so) => (
        <Card
          key={so.salesOrderId}
          size="small"
          style={{ border: '1px solid #fecaca' }}
          styles={{ body: { padding: 14 } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Space size={8} align="center">
                <Text strong style={{ fontSize: 14 }}>{so.soNo}</Text>
                <Text type="secondary">·</Text>
                <Text style={{ fontSize: 13 }}>{so.storeName}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>출고예정 {so.scheduledDate}</Text>
              </Space>
              <div style={{ marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  부족 품목 {so.items.length}건
                </Text>
              </div>
            </div>
            <Button
              size="small"
              icon={<RightOutlined />}
              iconPosition="end"
              onClick={() => navigate(`/order/sales-orders/${so.salesOrderId}/progress`)}
            >
              진행률 페이지
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {so.items.map((item: SoShortageItem) => (
              <div
                key={`${so.salesOrderId}-${item.productId}`}
                style={{
                  padding: '8px 10px',
                  background: '#fef2f2',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={8}>
                    <Text strong style={{ fontSize: 12 }}>{item.productName}</Text>
                    <Text type="secondary" style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                      {item.sku}
                    </Text>
                  </Space>
                  <div style={{ marginTop: 2 }}>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                      필요 {item.requiredQty} / 가용 {item.availableQty} → 부족{' '}
                    </Text>
                    <Text strong style={{ fontSize: 12, color: '#dc2626' }}>
                      {item.shortageQty}개
                    </Text>
                  </div>
                </div>
                <Tooltip title="이 상품을 부족 수량만큼 긴급 입고">
                  <Button
                    size="small"
                    type="primary"
                    danger
                    icon={<ThunderboltOutlined />}
                    onClick={() =>
                      onUrgentInbound({
                        productId: item.productId,
                        productName: item.productName,
                        sku: item.sku,
                        shortageQty: item.shortageQty,
                      })
                    }
                  >
                    긴급 입고
                  </Button>
                </Tooltip>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
