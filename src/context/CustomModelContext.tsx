"use client";

import * as tf from "@tensorflow/tfjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DANCE_ACTION_IDS } from "@/lib/dance/sequence";
import {
  clearSavedCustomModel,
  loadCustomModelFromBrowser,
} from "@/lib/ml/storage";
import type { CustomModelMetadata } from "@/lib/ml/types";
import { CUSTOM_IDLE_LABEL } from "@/lib/ml/types";
import { normalizeLabel } from "@/lib/ml/training";

type CustomModelContextValue = {
  hasLoadedModel: boolean;
  model: tf.LayersModel | null;
  metadata: CustomModelMetadata | null;
  classNames: string[];
  trainedCustomMoveIds: string[];
  availableChoreographyIds: string[];
  refreshFromStorage: () => Promise<void>;
  clearStoredModel: () => Promise<void>;
};

const CustomModelContext = createContext<CustomModelContextValue | null>(null);

function buildAvailableChoreographyIds(classNames: readonly string[]): string[] {
  const fromModel = classNames.map((c) => normalizeLabel(c)).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of DANCE_ACTION_IDS) {
    seen.add(d);
    out.push(d);
  }
  for (const c of fromModel) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

function trainedCustomOnly(classNames: readonly string[]): string[] {
  const def = new Set<string>(DANCE_ACTION_IDS);
  return classNames
    .map((c) => normalizeLabel(c))
    .filter((c) => c.length > 0 && c !== CUSTOM_IDLE_LABEL && !def.has(c));
}

export function CustomModelProvider({ children }: { children: ReactNode }) {
  const modelRef = useRef<tf.LayersModel | null>(null);
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [metadata, setMetadata] = useState<CustomModelMetadata | null>(null);
  const [hasLoadedModel, setHasLoadedModel] = useState(false);

  const refreshFromStorage = useCallback(async () => {
    const loaded = await loadCustomModelFromBrowser();
    modelRef.current?.dispose();
    if (loaded) {
      modelRef.current = loaded.model;
      setModel(loaded.model);
      setMetadata(loaded.meta);
      setHasLoadedModel(true);
    } else {
      modelRef.current = null;
      setModel(null);
      setMetadata(null);
      setHasLoadedModel(false);
    }
  }, []);

  useEffect(() => {
    void refreshFromStorage();
  }, [refreshFromStorage]);

  /**
   * Reload the saved model when the tab becomes visible again (e.g. after training on another route,
   * or another tab finishing training). Throttled — each refresh disposes and reloads TF.js weights.
   */
  useEffect(() => {
    let lastRefreshAt = 0;
    const THROTTLE_MS = 2000;
    const maybeRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshAt < THROTTLE_MS) return;
      lastRefreshAt = now;
      void refreshFromStorage();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") maybeRefresh();
    };
    const onFocus = () => {
      maybeRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshFromStorage]);

  const classNames = useMemo(() => metadata?.classNames ?? [], [metadata]);
  const trainedCustomMoveIds = useMemo(() => trainedCustomOnly(classNames), [classNames]);
  const availableChoreographyIds = useMemo(
    () => buildAvailableChoreographyIds(classNames),
    [classNames]
  );

  const clearStoredModel = useCallback(async () => {
    modelRef.current?.dispose();
    modelRef.current = null;
    setModel(null);
    setMetadata(null);
    setHasLoadedModel(false);
    await clearSavedCustomModel();
  }, []);

  const value = useMemo<CustomModelContextValue>(
    () => ({
      hasLoadedModel,
      model,
      metadata,
      classNames,
      trainedCustomMoveIds,
      availableChoreographyIds,
      refreshFromStorage,
      clearStoredModel,
    }),
    [
      hasLoadedModel,
      model,
      metadata,
      classNames,
      trainedCustomMoveIds,
      availableChoreographyIds,
      refreshFromStorage,
      clearStoredModel,
    ]
  );

  return <CustomModelContext.Provider value={value}>{children}</CustomModelContext.Provider>;
}

export function useCustomModel(): CustomModelContextValue {
  const ctx = useContext(CustomModelContext);
  if (!ctx) {
    throw new Error("useCustomModel must be used within CustomModelProvider");
  }
  return ctx;
}

export function useCustomModelOptional(): CustomModelContextValue | null {
  return useContext(CustomModelContext);
}
