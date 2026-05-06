import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/api/role';
import type { CreateRoleRequest, UpdateRoleRequest } from '@/types/role';

export const useRoles = () => useQuery({ queryKey: ['roles'], queryFn: api.getRoles });

export const usePermissions = () => useQuery({ queryKey: ['permissions'], queryFn: api.getPermissions });

export const useCreateRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRoleRequest) => api.createRole(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
};

export const useUpdateRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleRequest }) => api.updateRole(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
};

export const useDeleteRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRole(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
};
