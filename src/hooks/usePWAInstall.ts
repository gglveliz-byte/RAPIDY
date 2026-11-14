import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type PWAInstallOutcome = "accepted" | "dismissed" | "unavailable";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

const DISMISS_STORAGE_KEY = "rapidy_pwa_dismissed_until";
const LEGACY_DISMISS_KEY = "pwa_dismissed";
const DISMISS_DAYS = 14;
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

// El evento beforeinstallprompt puede dispararse antes de que React monte el
// banner. Guardarlo a nivel de módulo evita perderlo.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

function emitPromptChange() {
  for (const subscriber of subscribers) subscriber();
}

function subscribeToPrompt(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function getPromptSnapshot() {
  return deferredPrompt;
}

function getPromptServerSnapshot() {
  return null;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emitPromptChange();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emitPromptChange();
  });
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Safari privado / almacenamiento bloqueado: seguimos en memoria.
  }
}

function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Noop.
  }
}

function readDismissedUntil(): number {
  if (typeof window === "undefined") return 0;

  const stored = Number(readStorage(DISMISS_STORAGE_KEY));
  if (Number.isFinite(stored) && stored > 0) {
    return stored > Date.now() ? stored : 0;
  }

  // Migración del flag viejo (sin vencimiento): respetarlo 14 días más.
  if (readStorage(LEGACY_DISMISS_KEY) === "true") {
    const until = Date.now() + DISMISS_MS;
    writeStorage(DISMISS_STORAGE_KEY, String(until));
    removeStorage(LEGACY_DISMISS_KEY);
    return until;
  }

  return 0;
}

function readStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const isIpadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || isIpadOs;
}

export function usePWAInstall() {
  const promptEvent = useSyncExternalStore(
    subscribeToPrompt,
    getPromptSnapshot,
    getPromptServerSnapshot
  );
  const [isInstalled, setIsInstalled] = useState(readStandalone);
  const [dismissedUntil, setDismissedUntil] = useState(readDismissedUntil);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia?.("(display-mode: standalone)");
    const handleDisplayMode = () => setIsInstalled(readStandalone());
    const handleInstalled = () => setIsInstalled(true);

    media?.addEventListener?.("change", handleDisplayMode);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      media?.removeEventListener?.("change", handleDisplayMode);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (dismissedUntil <= 0) return;

    const remaining = dismissedUntil - Date.now();
    if (remaining <= 0) {
      const expiredTimer = window.setTimeout(() => setDismissedUntil(0), 0);
      return () => window.clearTimeout(expiredTimer);
    }

    const timer = window.setTimeout(() => {
      setDismissedUntil(0);
    }, remaining + 50);

    return () => window.clearTimeout(timer);
  }, [dismissedUntil]);

  const install = useCallback(async (): Promise<PWAInstallOutcome> => {
    if (!deferredPrompt) return "unavailable";

    const event = deferredPrompt;
    deferredPrompt = null;
    emitPromptChange();

    try {
      await event.prompt();
      const choice = await event.userChoice;

      if (choice.outcome === "accepted") {
        removeStorage(DISMISS_STORAGE_KEY);
        setDismissedUntil(0);
        setIsInstalled(true);
        return "accepted";
      }

      return "dismissed";
    } catch {
      return "unavailable";
    }
  }, []);

  const dismiss = useCallback(() => {
    const until = Date.now() + DISMISS_MS;
    writeStorage(DISMISS_STORAGE_KEY, String(until));
    removeStorage(LEGACY_DISMISS_KEY);
    setDismissedUntil(until);
  }, []);

  const isDismissed = dismissedUntil > 0;
  const canInstall = Boolean(promptEvent) && !isInstalled;

  return {
    canInstall,
    showPrompt: canInstall && !isDismissed,
    isInstalled,
    isIos: detectIos(),
    isDismissed,
    install,
    // Alias mantenidos por compatibilidad con consumidores previos del hook.
    triggerPrompt: install,
    dismiss,
  };
}