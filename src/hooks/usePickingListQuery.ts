import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWave, getWavePickingLists } from '@/api/pickingList';

export const useWavePickingLists = () => useQuery({
  queryKey: ['wave-picking-lists'],
  queryFn: getWavePickingLists,
});

export const useCreateWave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWave,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wave-picking-lists'] });
      qc.invalidateQueries({ queryKey: ['outbound-orders'] });
      qc.invalidateQueries({ queryKey: ['picking-lists'] });
      qc.invalidateQueries({ queryKey: ['picking-items'] });
    },
  });
};
