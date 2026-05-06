import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as warehouseApi from '@/api/warehouse';
import { getMasterWarehouses } from '@/api/masterWarehouse';
import type { WarehouseType } from '@/types/warehouse';

export const useWarehouses = (warehouseType?: WarehouseType) =>
  useQuery({
    queryKey: ['warehouses', warehouseType ?? null],
    queryFn: () => warehouseApi.getWarehouses(warehouseType),
  });

/** master-service 실연동 창고 목록 (UUID 포함) — 주문 모듈 드롭다운용 */
export const useMasterWarehouses = (enabled = true) =>
  useQuery({ queryKey: ['master-warehouses'], queryFn: getMasterWarehouses, enabled });

export const useWarehouseDetail = (id: string) =>
  useQuery({ queryKey: ['warehouse', id], queryFn: () => warehouseApi.getWarehouse(id), enabled: !!id });

export const useCreateWarehouse = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: warehouseApi.createWarehouse, onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }) });
};

export const useUpdateWarehouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof warehouseApi.updateWarehouse>[1] }) => warehouseApi.updateWarehouse(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); qc.invalidateQueries({ queryKey: ['warehouse'] }); },
  });
};

export const useDeactivateWarehouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => warehouseApi.deactivateWarehouse(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); qc.invalidateQueries({ queryKey: ['warehouse'] }); },
  });
};

export const useActivateWarehouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => warehouseApi.activateWarehouse(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); qc.invalidateQueries({ queryKey: ['warehouse'] }); },
  });
};

export const useZones = (warehouseId?: string) =>
  useQuery({ queryKey: ['zones', warehouseId], queryFn: () => warehouseApi.getZones(warehouseId) });

export const useZonesByWarehouse = (warehouseId: string) =>
  useQuery({ queryKey: ['zones', warehouseId], queryFn: () => warehouseApi.getZones(warehouseId), enabled: !!warehouseId });

export const useCreateZone = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: warehouseApi.createZone, onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }) });
};

export const useUpdateZone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof warehouseApi.updateZone>[1] }) => warehouseApi.updateZone(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
};

export const useDeactivateZone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => warehouseApi.deactivateZone(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
};

export const useActivateZone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => warehouseApi.activateZone(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
};

export const useRacks = (params?: { warehouseId?: string; zoneId?: string }) =>
  useQuery({ queryKey: ['racks', params], queryFn: () => warehouseApi.getRacks(params) });

export const useRacksByZone = (zoneId: string) =>
  useQuery({ queryKey: ['racks', { zoneId }], queryFn: () => warehouseApi.getRacks({ zoneId }), enabled: !!zoneId });

export const useCreateRack = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: warehouseApi.createRack, onSuccess: () => qc.invalidateQueries({ queryKey: ['racks'] }) });
};

export const useUpdateRack = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof warehouseApi.updateRack>[1] }) => warehouseApi.updateRack(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['racks'] }),
  });
};

export const useDeactivateRack = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => warehouseApi.deactivateRack(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['racks'] }),
  });
};

export const useActivateRack = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => warehouseApi.activateRack(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['racks'] }),
  });
};

export const useZoneLayouts = (warehouseId: string) =>
  useQuery({ queryKey: ['zone-layouts', warehouseId], queryFn: () => warehouseApi.getZoneLayouts(warehouseId), enabled: !!warehouseId });

export const useRackLayouts = (zoneId: string) =>
  useQuery({ queryKey: ['rack-layouts', zoneId], queryFn: () => warehouseApi.getRackLayouts(zoneId), enabled: !!zoneId });

export const useRackLayoutsByWarehouse = (warehouseId: string) =>
  useQuery({
    queryKey: ['rack-layouts-warehouse', warehouseId],
    queryFn: () => warehouseApi.getRackLayoutsByWarehouse(warehouseId),
    enabled: !!warehouseId,
  });

export const useRackStocks = (warehouseId?: string) =>
  useQuery({ queryKey: ['rack-stocks', warehouseId], queryFn: () => warehouseApi.getRackStocks(warehouseId) });

export const useWarehouseCanvas = (warehouseId: string) =>
  useQuery({ queryKey: ['warehouse-canvas', warehouseId], queryFn: () => warehouseApi.getWarehouseCanvas(warehouseId), enabled: !!warehouseId });

export const useSaveRackLayouts = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { zoneId: string; warehouseId: string; layouts: Parameters<typeof warehouseApi.saveRackLayouts>[2] }) =>
      warehouseApi.saveRackLayouts(p.zoneId, p.warehouseId, p.layouts),
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ['rack-layouts', p.zoneId] });
      qc.invalidateQueries({ queryKey: ['rack-layouts-warehouse', p.warehouseId] });
      qc.invalidateQueries({ queryKey: ['racks'] });
    },
  });
};
