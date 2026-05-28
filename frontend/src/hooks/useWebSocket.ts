import { useEffect, useRef, useState } from "react";
import type { TaskProgressMessage, WsStatus } from "../types";

type WsListener = (payload: TaskProgressMessage) => void;

let globalWsStatus: WsStatus = "connecting";
let globalListeners: WsListener[] = [];
let globalSocket: WebSocket | null = null;
const globalClosed = false;

function notifyListeners(payload: TaskProgressMessage) {
  for (const listener of globalListeners) {
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
    const payload = JSON.parse(event.data) as TaskProgressMessage;
    if (payload.type === "task_progress") {
      notifyListeners(payload);
    }
  };

  globalSocket.onclose = () => {
    if (globalClosed) return;
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
    if (!globalSocket && !globalClosed) {
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
    const listener: WsListener = (payload) => callbackRef.current(payload);
    globalListeners.push(listener);
    return () => {
      globalListeners = globalListeners.filter((l) => l !== listener);
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
