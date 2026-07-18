"use client";
import { useQuery } from "@tanstack/react-query";

export interface EntitlementView {
  authenticated: boolean;
  lifetimeOwned: boolean;
  subActive: boolean;
  can: { paidCore: boolean; cloud: boolean };
}

const ANON: EntitlementView = {
  authenticated: false, lifetimeOwned: false, subActive: false,
  can: { paidCore: false, cloud: false },
};

export function useEntitlement() {
  return useQuery<EntitlementView>({
    queryKey: ["entitlement"],
    queryFn: async () => {
      const res = await fetch("/api/entitlement");
      if (!res.ok) return ANON;
      return res.json();
    },
    initialData: ANON,
  });
}
