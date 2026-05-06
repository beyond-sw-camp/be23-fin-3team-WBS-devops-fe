import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as orderApi from '@/api/order';

/* ── 입고 훅은 useInboundQuery.ts 로 이동 ── */

/* ── 출고 ── */
export const useOutboundOrders = (params?: { status?: string | string[]; originType?: 'return'; excludeOriginType?: 'return' }) =>
  useQuery({ queryKey: ['outbound-orders', params], queryFn: () => orderApi.getOutboundOrders(params) });

export const useOutboundOrder = (id: string) =>
  useQuery({ queryKey: ['outbound-order', id], queryFn: () => orderApi.getOutboundOrder(id), enabled: !!id });

export const useOutboundItems = (orderId: string) =>
  useQuery({ queryKey: ['outbound-items', orderId], queryFn: () => orderApi.getOutboundItems(orderId), enabled: !!orderId });

/** productIds로 라인 좁히기. productIds=null 이면 hook 비활성. */
export const useOutboundItemsSearch = (orderId: string, productIds: string[] | null) =>
  useQuery({
    queryKey: ['outbound-items', orderId, 'search', productIds],
    queryFn: () => orderApi.searchOutboundOrderItems(orderId, productIds ?? []),
    enabled: !!orderId && productIds !== null,
  });

/** 목록 화면에서 productIds로 좁힌 출고지시서 검색.
 *  opts.excludeOriginType='return' 으로 반품 자동 제외 가능. */
export const useSearchOutboundOrders = (
  productIds: string[] | null,
  opts?: { originType?: 'return'; excludeOriginType?: 'return' },
) =>
  useQuery({
    queryKey: ['outbound-orders', 'search', productIds, opts],
    queryFn: () => orderApi.searchOutboundOrders({
      productIds: productIds ?? [],
      ...(opts ?? {}),
    }),
    enabled: productIds !== null,
  });

/** 출고전표 검색. productIds=null이면 hook 비활성. */
export const useSearchOutboundDispatches = (
  filters: Parameters<typeof orderApi.searchOutboundDispatches>[0],
  productIds: string[] | null,
) =>
  useQuery({
    queryKey: ['outbound-dispatches', 'search', filters, productIds],
    queryFn: () => orderApi.searchOutboundDispatches({ ...filters, productIds: productIds ?? undefined }),
    enabled: productIds !== null,
  });

export const useCreateOutboundOrder = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: orderApi.createOutboundOrder, onSuccess: () => qc.invalidateQueries({ queryKey: ['outbound-orders'] }) });
};

export const useApproveOutbound = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: orderApi.approveOutboundOrder, onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound-orders'] }); qc.invalidateQueries({ queryKey: ['outbound-order'] }); } });
};

export const useCreateManualOutbound = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: orderApi.CreateManualOutboundInput) => orderApi.createManualOutbound(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound-orders'] }); },
  });
};

/** 반품 출고 생성 — 일반 출고 목록에도 영향. */
export const useCreateReturnOutbound = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: orderApi.CreateReturnOutboundInput) => orderApi.createReturnOutbound(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outbound-orders'] });
      qc.invalidateQueries({ queryKey: ['inbound-orders'] }); // 반품 출고 가능 수량 갱신
    },
  });
};

export const useCancelOutbound = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: orderApi.cancelOutboundOrder, onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound-orders'] }); qc.invalidateQueries({ queryKey: ['outbound-order'] }); } });
};

export const useConfirmOutbound = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: orderApi.confirmOutboundOrder, onSuccess: (_data, orderId) => {
    qc.invalidateQueries({ queryKey: ['outbound-orders'] });
    qc.invalidateQueries({ queryKey: ['outbound-order'] });
    qc.invalidateQueries({ queryKey: ['outbound-dispatch', orderId] });
  } });
};

// 출고 전표 — 출고지시서 ID 기준 조회. 확정 전엔 호출 안 함 (enabled).
export const useOutboundDispatch = (orderId: string, enabled = true) =>
  useQuery({
    queryKey: ['outbound-dispatch', orderId],
    queryFn: () => orderApi.getOutboundDispatch(orderId),
    enabled: !!orderId && enabled,
  });

export const useForceReleaseResidual = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: orderApi.forceReleaseResidual,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outbound-orders'] });
      qc.invalidateQueries({ queryKey: ['outbound-order'] });
      qc.invalidateQueries({ queryKey: ['inventory-transactions'] });
    },
  });
};

/* ── 기타 입출고 ── */
export const useEtcInOutOrders = () =>
  useQuery({ queryKey: ['etc-inout-orders'], queryFn: orderApi.getEtcInOutOrders });

export const useEtcInOutItems = (id: string | null | undefined) =>
  useQuery({ queryKey: ['etc-inout-items', id], queryFn: () => orderApi.getEtcInOutItems(id!), enabled: !!id });

export const useEtcInOutDetail = (id: string | null | undefined) =>
  useQuery({ queryKey: ['etc-inout-detail', id], queryFn: () => orderApi.getEtcInOutDetail(id!), enabled: !!id });

export const useCreateEtcInOut = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: orderApi.createEtcInOutOrder,
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['etc-inout-orders'] });
      qc.invalidateQueries({ queryKey: ['etc-inout-items', order.id] });
    },
  });
};

/** draft → approved (작업자 자동 배정) */
export const useApproveEtcInOut = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orderApi.approveEtcInOut(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['etc-inout-orders'] });
      qc.invalidateQueries({ queryKey: ['etc-inout-items', id] });
    },
  });
};

export const useCompleteEtcInOut = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orderApi.completeEtcInOut(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['etc-inout-orders'] });
      qc.invalidateQueries({ queryKey: ['etc-inout-items', id] });
      qc.invalidateQueries({ queryKey: ['inventory-stocks'] });
      qc.invalidateQueries({ queryKey: ['inventory-by-rack'] });
      qc.invalidateQueries({ queryKey: ['inventory-transactions'] });
    },
  });
};

export const useCancelEtcInOut = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orderApi.cancelEtcInOut(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['etc-inout-orders'] });
      qc.invalidateQueries({ queryKey: ['etc-inout-items', id] });
    },
  });
};

/** 기타출고 입고 요청 메일 양식 받기 — STOCK_SHORTAGE 후 운영자가 OMS에 메일 보낼 때 사용 */
/** 기타출고 — 입고 요청 메일 미리보기 (모달 진입 시 폼 초기값) */
export const useEtcInoutInboundRequestPreview = (id: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: ['etc-inout-inbound-request-preview', id],
    queryFn: () => orderApi.getEtcInoutInboundRequestPreview(id!),
    enabled: !!id && enabled,
  });

/** 기타출고 — 백엔드 SMTP 자동 발송 */
export const useSendEtcInoutInboundRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: orderApi.EtcInoutSendInboundRequestInput }) =>
      orderApi.sendEtcInoutInboundRequest(id, input),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['etc-inout-email-history', id] });
    },
  });
};

/** 기타출고 — 입고 요청 메일 발송 이력 */
export const useEtcInoutEmailHistory = (id: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: ['etc-inout-email-history', id],
    queryFn: () => orderApi.getEtcInoutEmailHistory(id!),
    enabled: !!id && enabled,
  });

/* ── 피킹 ──
 * 모바일 작업자의 피킹 진행 상황을 웹 관리자가 실시간에 가깝게 보기 위해
 * 진행중(pending/in_progress)일 때만 3~5초 간격 폴링.
 * completed/partial 로 끝나면 자동으로 폴링 중단 → DB 부담 최소화.
 */
const PICKING_TERMINAL = new Set(['completed', 'partial']);

export const usePickingLists = () =>
  useQuery({
    queryKey: ['picking-lists'],
    queryFn: orderApi.getPickingLists,
    refetchInterval: 5000,
  });

export const usePickingList = (id: string) =>
  useQuery({
    queryKey: ['picking-list', id],
    queryFn: () => orderApi.getPickingList(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && PICKING_TERMINAL.has(status) ? false : 3000;
    },
  });

export const usePickingItems = (pickingId: string) =>
  useQuery({
    queryKey: ['picking-items', pickingId],
    queryFn: () => orderApi.getPickingItems(pickingId),
    refetchInterval: 3000,
  });

/** productIds로 라인 좁히기. productIds=null 이면 hook 비활성. */
export const usePickingItemsSearch = (pickingId: string, productIds: string[] | null) =>
  useQuery({
    queryKey: ['picking-items', pickingId, 'search', productIds],
    queryFn: () => orderApi.searchPickingListItems(pickingId, productIds ?? []),
    enabled: !!pickingId && productIds !== null,
    refetchInterval: 3000,
  });

/** 목록 화면에서 productIds로 좁힌 피킹리스트 검색. */
export const useSearchPickingLists = (productIds: string[] | null) =>
  useQuery({
    queryKey: ['picking-lists', 'search', productIds],
    queryFn: () => orderApi.searchPickingLists({ productIds: productIds ?? [] }),
    enabled: productIds !== null,
  });

export const useCompletePicking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: { id: string; picked_qty: number }[] }) => orderApi.completePickingList(id, items),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['picking-lists'] }); qc.invalidateQueries({ queryKey: ['picking-list'] }); qc.invalidateQueries({ queryKey: ['picking-items'] }); },
  });
};

/* ── 이동 ── */
export const useTransferOrders = () =>
  useQuery({ queryKey: ['transfer-orders'], queryFn: () => orderApi.getTransferOrders() });

/** 이동 지시서 검색. productIds=null이면 hook 비활성. */
export const useSearchTransferOrders = (productIds: string[] | null) =>
  useQuery({
    queryKey: ['transfer-orders', 'search', productIds],
    queryFn: () => orderApi.searchTransferOrders({ productIds: productIds ?? [] }),
    enabled: productIds !== null,
  });

export const useTransferOrder = (id: string) =>
  useQuery({ queryKey: ['transfer-order', id], queryFn: () => orderApi.getTransferOrder(id), enabled: !!id });

export const useTransferItems = (orderId: string) =>
  useQuery({ queryKey: ['transfer-items', orderId], queryFn: () => orderApi.getTransferItems(orderId), enabled: !!orderId });

export const useCreateTransfer = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: orderApi.createTransferOrder, onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-orders'] }) });
};

export const useApproveTransfer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orderApi.approveTransferOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfer-orders'] }); qc.invalidateQueries({ queryKey: ['transfer-order'] }); qc.invalidateQueries({ queryKey: ['transfer-items'] }); },
  });
};

export const useCancelTransfer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orderApi.cancelTransferOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfer-orders'] }); qc.invalidateQueries({ queryKey: ['transfer-order'] }); },
  });
};

export const useProcessTransferItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, goodQty, defectQty }: { itemId: string; goodQty: number; defectQty: number }) =>
      orderApi.processTransferItem(itemId, goodQty, defectQty),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfer-orders'] });
      qc.invalidateQueries({ queryKey: ['transfer-order'] });
      qc.invalidateQueries({ queryKey: ['transfer-items'] });
    },
  });
};

export const useCompleteTransfer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => orderApi.completeTransferOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfer-orders'] }); qc.invalidateQueries({ queryKey: ['transfer-order'] }); },
  });
};

/* ── ERP ── */
export const useErpPurchaseOrders = () =>
  useQuery({ queryKey: ['erp-purchase-orders'], queryFn: orderApi.getErpPurchaseOrders });

export const useErpSalesOrders = (filter?: import('@/types/order').ErpSalesOrderListFilter) =>
  useQuery({
    queryKey: ['erp-sales-orders', filter ?? {}],
    queryFn: () => orderApi.getErpSalesOrders(filter),
  });

/* ── 출고지시서 다중 SO 흐름 ── */

/** 미리보기 — POST 라 mutation 으로 (필요 시 trigger) */
export const usePreviewOutboundFromSalesOrders = () =>
  useMutation({
    mutationFn: (args: { salesOrderIds: string[]; excludeOutboundOrderId?: string }) =>
      orderApi.previewOutboundFromSalesOrders(args.salesOrderIds, args.excludeOutboundOrderId),
  });

/** 수동 출고 미리보기 — 입력한 품목으로 (창고 × 품목) 매트릭스 조회 */
export const usePreviewManualOutbound = () =>
  useMutation({
    mutationFn: (input: orderApi.ManualPreviewInput) => orderApi.previewManualOutbound(input),
  });

/** 분할 추천 */
export const useRecommendOutboundSplit = () =>
  useMutation({
    mutationFn: (args: { salesOrderIds: string[]; storeId: string; excludeOutboundOrderId?: string }) =>
      orderApi.recommendOutboundSplit(args.salesOrderIds, args.storeId, args.excludeOutboundOrderId),
  });

/** 다중 SO → OB 생성 */
export const useCreateOutboundFromSalesOrders = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: import('@/types/order').CreateOutboundFromSalesOrdersRequest) =>
      orderApi.createOutboundFromSalesOrders(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outbound-orders'] });
      qc.invalidateQueries({ queryKey: ['erp-sales-orders'] });
    },
  });
};

/** 수주서 진행률 */
export const useSalesOrderProgress = (salesOrderId: string | null | undefined) =>
  useQuery({
    queryKey: ['sales-order-progress', salesOrderId],
    queryFn: () => orderApi.getSalesOrderProgress(salesOrderId!),
    enabled: !!salesOrderId,
  });
