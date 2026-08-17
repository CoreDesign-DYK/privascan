/**
 * use-local-scans.ts
 * React Query wrappers around local-db — zero network, zero server cost.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listScans, getScan, saveScan, updateScan, deleteScan,
  type LocalScan,
} from '@/lib/local-db';

export type { LocalScan };

const SCANS_KEY = ['local-scans'] as const;
const scanKey = (id: string) => ['local-scan', id] as const;

export function useLocalScans() {
  return useQuery({ queryKey: SCANS_KEY, queryFn: listScans });
}

export function useLocalScan(id: string | null) {
  return useQuery({
    queryKey: scanKey(id ?? ''),
    queryFn: () => getScan(id!),
    enabled: !!id,
  });
}

export function useSaveScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<LocalScan, 'id' | 'createdAt'>) => saveScan(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCANS_KEY }),
  });
}

export function useUpdateScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<LocalScan, 'id' | 'createdAt'>> }) =>
      updateScan(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCANS_KEY }),
  });
}

export function useDeleteLocalScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCANS_KEY }),
  });
}
