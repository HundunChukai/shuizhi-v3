"use client";

import {
  useCallback,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";

const memoryStore = new Map<string, string>();

export function usePersistentState<T>(key: string, initialValue: T) {
  const initialSerialized = JSON.stringify(initialValue);
  const eventName = `jack-storage:${key}`;

  const getSnapshot = useCallback(() => {
    const memoryValue = memoryStore.get(key);
    if (memoryValue !== undefined) return memoryValue;
    try {
      return window.localStorage.getItem(key) ?? initialSerialized;
    } catch {
      return initialSerialized;
    }
  }, [initialSerialized, key]);

  const subscribe = useCallback((onStoreChange: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) onStoreChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(eventName, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(eventName, onStoreChange);
    };
  }, [eventName, key]);

  const serialized = useSyncExternalStore(subscribe, getSnapshot, () => initialSerialized);
  let value = initialValue;
  try {
    value = JSON.parse(serialized) as T;
  } catch {
    value = initialValue;
  }

  const setValue: Dispatch<SetStateAction<T>> = useCallback((nextValue) => {
    let currentValue = initialValue;
    try {
      currentValue = JSON.parse(getSnapshot()) as T;
    } catch {
      currentValue = initialValue;
    }
    const resolved = typeof nextValue === "function"
      ? (nextValue as (current: T) => T)(currentValue)
      : nextValue;
    const nextSerialized = JSON.stringify(resolved);
    memoryStore.set(key, nextSerialized);
    try {
      window.localStorage.setItem(key, nextSerialized);
    } catch {
      // Memory persistence keeps the page usable when browser storage is blocked.
    }
    window.dispatchEvent(new Event(eventName));
  }, [eventName, getSnapshot, initialValue, key]);

  return [value, setValue] as const;
}
