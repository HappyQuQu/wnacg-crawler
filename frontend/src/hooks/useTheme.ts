import { useLayoutEffect } from "react";
import type { ThemePreference } from "../types";

export function useTheme(preference: ThemePreference = "system") {
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = preference === "system"
        ? (media.matches ? "dark" : "light")
        : preference;
    };

    apply();
    if (preference !== "system") return;

    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
}
