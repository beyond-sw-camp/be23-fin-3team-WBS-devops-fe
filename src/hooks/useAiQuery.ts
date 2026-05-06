import { useMutation } from '@tanstack/react-query';
import { askWorkQuery, type ChatTurn } from '@/api/ai';

/** WMS 자연어 업무 조회. */
export const useWorkQuery = () =>
  useMutation({
    mutationFn: (params: { message: string; history?: ChatTurn[] }) =>
      askWorkQuery(params.message, params.history ?? []),
  });
