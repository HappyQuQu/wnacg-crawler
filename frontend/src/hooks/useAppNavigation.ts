import { useCallback, useEffect, useRef, useState } from "react";
import type { LogFilter, QueueFilter, ViewKey } from "../types";

type AppRoute = { view: ViewKey; queueTab: QueueFilter; logLevel: LogFilter; logTaskId: string; search: string };
const views = ["dashboard", "tasks", "library", "logs", "settings"];
const queueTabs = ["all", "active", "failed", "partial", "completed", "attention"];
const logLevels = ["all", "problems", "error", "warning", "info"];

function readRoute(): AppRoute {
  const [path, query] = window.location.hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  const legacyLogs = path === "tasks" && params.get("tab") === "logs";
  return {
    view: legacyLogs ? "logs" : views.includes(path) ? path as ViewKey : "dashboard",
    queueTab: queueTabs.includes(params.get("status") ?? "") ? params.get("status") as QueueFilter : "all",
    logLevel: logLevels.includes(params.get("level") ?? "") ? params.get("level") as LogFilter : "all",
    logTaskId: params.get("task") ?? "",
    search: params.get("q") ?? "",
  };
}

function routeHash(route: AppRoute) {
  const params = new URLSearchParams();
  if (route.view === "tasks" && route.queueTab !== "all") params.set("status", route.queueTab);
  if (route.view === "logs") {
    if (route.logLevel !== "all") params.set("level", route.logLevel);
    if (route.logTaskId) params.set("task", route.logTaskId);
  }
  if (route.search) params.set("q", route.search);
  return `#/${route.view}${params.size ? `?${params}` : ""}`;
}

export function useAppNavigation() {
  const [route, setRoute] = useState(readRoute);
  const current = useRef(route);
  useEffect(() => {
    const sync = () => { current.current = readRoute(); setRoute(current.current); };
    // Hash routes also work when FastAPI serves the compiled application.
    window.history.replaceState(null, "", routeHash(current.current));
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, []);
  const navigate = useCallback((patch: Partial<AppRoute>, replace = false) => {
    const next = { ...current.current, ...patch };
    const hash = routeHash(next);
    if (window.location.hash !== hash) window.history[replace ? "replaceState" : "pushState"](null, "", hash);
    current.current = next;
    setRoute(next);
  }, []);
  return { route, navigate };
}
