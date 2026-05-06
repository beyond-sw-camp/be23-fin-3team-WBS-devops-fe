import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as inboundApi from '@/api/inbound';
import type { OrderStatus } from '@/types/order';

/* ── ASN ── */
export const useAsnOrders = (enabled = true) =>
  useQuery({ queryKey: ['asn-orders'], queryFn: inboundApi.getAsnOrders, enabled });

export const useCreateFromAsn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ asnId, warehouse }: { asnId: string; warehouse: string }) =>
      inboundApi.createInboundFromAsn(asnId, warehouse),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbound-orders'] });
      qc.invalidateQueries({ queryKey: ['asn-orders'] });
    },
  });
};

export const useCreateManualInbound = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: inboundApi.CreateManualInboundInput) => inboundApi.createManualInbound(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbound-orders'] });
    },
  });
};

export const useCancelInbound = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inboundApi.cancelInboundOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbound-orders'] });
      qc.invalidateQueries({ queryKey: ['inbound-order'] });
    },
  });
};

/* ── 반품 입고 ── */
export const useCreateFromReturn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: inboundApi.CreateReturnInboundInput) =>
      inboundApi.createInboundFromReturn(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbound-orders'] });
    },
  });
};

/* ── 입고 지시서 ── */
export const useInboundOrders = (params?: { status?: OrderStatus | OrderStatus[]; originType?: 'return'; excludeOriginType?: 'return' }) =>
  useQuery({ queryKey: ['inbound-orders', params], queryFn: () => inboundApi.getInboundOrders(params) });

export const useInboundOrder = (id: string) =>
  useQuery({ queryKey: ['inbound-order', id], queryFn: () => inboundApi.getInboundOrder(id), enabled: !!id });

export const useInboundItems = (orderId: string) =>
  useQuery({ queryKey: ['inbound-items', orderId], queryFn: () => inboundApi.getInboundItems(orderId), enabled: !!orderId });

/** productIds로 라인 좁히기. productIds=null 이면 hook 비활성 (기존 useInboundItems 사용). */
export const useInboundItemsSearch = (orderId: string, productIds: string[] | null) =>
  useQuery({
    queryKey: ['inbound-items', orderId, 'search', productIds],
    queryFn: () => inboundApi.searchInboundOrderItems(orderId, productIds ?? []),
    enabled: !!orderId && productIds !== null,
  });

/** 목록 화면에서 productIds로 좁힌 입고지시서 검색.
 *  productIds=null 이면 hook 비활성 (기존 useInboundOrders 사용).
 *  opts.excludeOriginType='return' 으로 반품 자동 제외 가능. */
export const useSearchInboundOrders = (
  productIds: string[] | null,
  opts?: { originType?: 'return'; excludeOriginType?: 'return' },
) =>
  useQuery({
    queryKey: ['inbound-orders', 'search', productIds, opts],
    queryFn: () => inboundApi.searchInboundOrders({
      productIds: productIds ?? [],
      ...(opts ?? {}),
    }),
    enabled: productIds !== null,
  });

/** 입고전표 검색 (page/size/필터 포함). productIds=null이면 hook 비활성. */
export const useSearchInboundReceipts = (
  filters: Parameters<typeof inboundApi.searchInboundReceipts>[0],
  productIds: string[] | null,
) =>
  useQuery({
    queryKey: ['inbound-receipts', 'search', filters, productIds],
    queryFn: () => inboundApi.searchInboundReceipts({ ...filters, productIds: productIds ?? undefined }),
    enabled: productIds !== null,
  });

/** 적치 지시서 검색. productIds=null이면 hook 비활성. */
export const useSearchPlacementOrders = (productIds: string[] | null) =>
  useQuery({
    queryKey: ['all-placements', 'search', productIds],
    queryFn: () => inboundApi.searchPlacementOrders({ productIds: productIds ?? [] }),
    enabled: productIds !== null,
  });

export const useInboundReceipt = (orderId: string, enabled = true) =>
  useQuery({
    queryKey: ['inbound-receipt', orderId],
    queryFn: () => inboundApi.getInboundReceipt(orderId),
    enabled: enabled && !!orderId,
    retry: false,
  });

export const useApproveInbound = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inboundApi.approveInboundOrder(id),
    onSuccess: async (_, id) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['inbound-orders'] }),
        qc.invalidateQueries({ queryKey: ['inbound-order', id] }),
        qc.invalidateQueries({ queryKey: ['inbound-items', id] }),
      ]);
    },
  });
};

/* ── 입고 확정 (수량 검수) ── */
export const useReceiveInbound = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, rows }: { orderId: string; rows: inboundApi.ReceiveRow[] }) =>
      inboundApi.receiveInbound(orderId, rows),
    onSuccess: async (_, { orderId }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['inbound-order', orderId] }),
        qc.invalidateQueries({ queryKey: ['inbound-orders'] }),
        qc.invalidateQueries({ queryKey: ['inbound-items', orderId] }),
        qc.invalidateQueries({ queryKey: ['inbound-receipt', orderId] }),
      ]);
    },
  });
};

/* ── 적치 조회/완료 ── */
export const usePlacementOrders = (orderId: string) =>
  useQuery({ queryKey: ['placement-orders', orderId], queryFn: () => inboundApi.getPlacementOrders(orderId), enabled: !!orderId });

export const useAllPlacements = (status?: 'pending' | 'placed') =>
  useQuery({ queryKey: ['all-placements', status], queryFn: () => inboundApi.getAllPlacements(status) });

export const useCompletePlacementItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => inboundApi.completePlacementItem(itemId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['all-placements'] }),
        qc.invalidateQueries({ queryKey: ['placement-orders'] }),
        qc.invalidateQueries({ queryKey: ['inbound-order'] }),
        qc.invalidateQueries({ queryKey: ['inbound-orders'] }),
      ]);
    },
  });
};

export const useAssignPlacementLocation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, locationId }: { itemId: string; locationId: string }) =>
      inboundApi.assignPlacementLocation(itemId, locationId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['all-placements'] }),
        qc.invalidateQueries({ queryKey: ['placement-orders'] }),
      ]);
    },
  });
};

export const useSplitAssignPlacementLocation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, assignments }: { itemId: string; assignments: inboundApi.SplitAssignment[] }) =>
      inboundApi.splitAssignPlacementLocation(itemId, assignments),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['all-placements'] }),
        qc.invalidateQueries({ queryKey: ['placement-orders'] }),
      ]);
    },
  });
};

export const useCompletePlacementOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placementOrderId: string) => inboundApi.completePlacementOrder(placementOrderId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['all-placements'] }),
        qc.invalidateQueries({ queryKey: ['placement-orders'] }),
        qc.invalidateQueries({ queryKey: ['inbound-order'] }),
        qc.invalidateQueries({ queryKey: ['inbound-orders'] }),
      ]);
    },
  });
};
