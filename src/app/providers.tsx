"use client";

import { CustomModelProvider } from "@/context/CustomModelContext";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <CustomModelProvider>{children}</CustomModelProvider>;
}
