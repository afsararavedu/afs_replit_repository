import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type InsertDailySale } from "@shared/schema";

export function useSales(date?: string) {
  const path = date ? `${api.sales.list.path}?date=${date}` : api.sales.list.path;
  return useQuery({
    queryKey: [api.sales.list.path, date],
    queryFn: async () => {
      const res = await fetch(path);
      if (!res.ok) throw new Error("Failed to fetch sales data");
      return api.sales.list.responses[200].parse(await res.json());
    },
    staleTime: 0,   // Always fetch fresh — prevents stale empty cache causing wrong date auto-switch
    gcTime: 0,      // Don't retain old results between date switches
  });
}

export function useSalesIsSubmitted(date: string) {
  return useQuery({
    queryKey: [api.sales.isSubmitted.path, date],
    queryFn: async () => {
      const res = await fetch(`${api.sales.isSubmitted.path}?date=${date}`);
      if (!res.ok) throw new Error("Failed to fetch submission status");
      return api.sales.isSubmitted.responses[200].parse(await res.json());
    },
    enabled: !!date,
  });
}

export function useBulkUpdateSales() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data, date }: { data: InsertDailySale[]; date?: string }) => {
      const url = date ? `${api.sales.bulkUpdate.path}?date=${date}` : api.sales.bulkUpdate.path;
      const res = await fetch(url, {
        method: api.sales.bulkUpdate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        if (res.status === 400) {
           const error = api.sales.bulkUpdate.responses[400].parse(await res.json());
           throw new Error(error.message);
        }
        throw new Error("Failed to update sales");
      }
      return api.sales.bulkUpdate.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sales.list.path] });
    },
  });
}

export function useSubmitSales() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const res = await fetch(api.sales.submit.path, {
        method: api.sales.submit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to submit sales");
      }
      return api.sales.submit.responses[200].parse(await res.json());
    },
    onSuccess: (_data, date) => {
      queryClient.invalidateQueries({ queryKey: [api.sales.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.sales.isSubmitted.path, date] });
    },
  });
}
