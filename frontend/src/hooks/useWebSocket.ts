import { useEffect, useRef, useState } from "react";
import type { LogItem, SystemAlertMessage, TaskLogMessage, TaskProgressMessage, WsStatus } from "../types";

type TaskListener = (payload: TaskProgressMessage) => void;
type AlertListener = (payload: SystemAlertMessage) => void;
type LogListener = (item: LogItem) => void;
type LibraryListener = (mangaIds: string[]) => void;

let globalWsStatus: WsStatus = "connecting";
let globalTaskListeners: TaskListener[] = [];
let globalAlertListeners: AlertListener[] = [];
let globalLogListeners: LogListener[] = [];
let globalLibraryListeners: LibraryListener[] = [];
let globalSocket: WebSocket | null = null;

function notifyTaskListeners(payload: TaskProgressMessage) {
  for (const listener of globalTaskListeners) {
    listener(payload);
  }
}

function notifyAlertListeners(payload: SystemAlertMessage) {
  for (const listener of globalAlertListeners) {
    listener(payload);
  }
}

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  globalSocket = new WebSocket(`${protocol}://${window.location.host}/ws/progress`);
  globalWsStatus = "connecting";
  notifyStatusChange();

  globalSocket.onopen = () => {
    globalWsStatus = "connected";
    notifyStatusChange();
  };

  globalSocket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      if (payload.type === "ping") {
        globalSocket?.send("pong");
        return;
      }
      if (payload.type === "task_progress") {
        notifyTaskListeners(payload as unknown as TaskProgressMessage);
      } else if (payload.type === "system_alert") {
        notifyAlertListeners(payload as unknown as SystemAlertMessage);
      } else if (payload.type === "task_log") {
        const { item } = payload as unknown as TaskLogMessage;
        for (const listener of globalLogListeners) listener(item);
      } else if (payload.type === "library_updated") {
        for (const listener of globalLibraryListeners) listener(payload.manga_ids as string[]);
      }
    } catch {
      // ignore malformed messages
    }
  };

  globalSocket.onclose = () => {
    globalWsStatus = "fallback";
    notifyStatusChange();
    window.setTimeout(connect, 3000);
  };

  globalSocket.onerror = () => {
    globalSocket?.close();
  };
}

type StatusListener = (status: WsStatus) => void;
let statusListeners: StatusListener[] = [];

function notifyStatusChange() {
  for (const listener of statusListeners) {
    listener(globalWsStatus);
  }
}

export function useWebSocket() {
  const [wsStatus, setWsStatus] = useState<WsStatus>(globalWsStatus);

  useEffect(() => {
    statusListeners.push(setWsStatus);
    if (!globalSocket) {
      connect();
    }
    return () => {
      statusListeners = statusListeners.filter((l) => l !== setWsStatus);
    };
  }, []);

  return wsStatus;
}

export function useWsTaskProgress(onProgress: (payload: TaskProgressMessage) => void) {
  const callbackRef = useRef(onProgress);
  callbackRef.current = onProgress;

  useEffect(() => {
    const listener: TaskListener = (payload) => callbackRef.current(payload);
    globalTaskListeners.push(listener);
    return () => {
      globalTaskListeners = globalTaskListeners.filter((l) => l !== listener);
    };
  }, []);
}

export function useWsSystemAlert(onAlert: (payload: SystemAlertMessage) => void) {
  const callbackRef = useRef(onAlert);
  callbackRef.current = onAlert;

  useEffect(() => {
    const listener: AlertListener = (payload) => callbackRef.current(payload);
    globalAlertListeners.push(listener);
    return () => {
      globalAlertListeners = globalAlertListeners.filter((l) => l !== listener);
    };
  }, []);
}

export function useWsLog(onLog: LogListener) {
  const callbackRef = useRef(onLog);
  callbackRef.current = onLog;
  useEffect(() => {
    const listener: LogListener = (item) => callbackRef.current(item);
    globalLogListeners.push(listener);
    return () => {
      globalLogListeners = globalLogListeners.filter((l) => l !== listener);
    };
  }, []);
}

export function useWsAutoRefresh(wsStatus: WsStatus, refresh: () => void) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (wsStatus === "connected") return undefined;
    const timer = window.setInterval(() => refreshRef.current(), 5000);
    return () => window.clearInterval(timer);
  }, [wsStatus]);
}

export function useWsLibraryUpdate(onUpdate: LibraryListener) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;
  useEffect(() => {
    const listener: LibraryListener = (ids) => callbackRef.current(ids);
    globalLibraryListeners.push(listener);
    return () => { globalLibraryListeners = globalLibraryListeners.filter((item) => item !== listener); };
  }, []);
}
