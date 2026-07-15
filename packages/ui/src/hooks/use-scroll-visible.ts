import { useCallback, useEffect, useRef } from "react";

/**
 * Adds a 'scrolling' CSS class to the element while it is being scrolled,
 * and removes it after scrolling stops (debounced by 800ms).
 * Works with the .sidebar-scrollbar CSS for scroll-triggered visibility.
 */
export function useScrollVisible<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("scrolling");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      el.classList.remove("scrolling");
    }, 800);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      clearTimeout(timerRef.current);
    };
  }, [handleScroll]);

  return ref;
}
