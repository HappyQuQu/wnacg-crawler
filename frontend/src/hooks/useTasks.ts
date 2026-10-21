import { useCallback, useMemo, useRef, useState } from "react";
import type { Task, TaskProgressMessage } from "../types";
import { fetchTasks, retryTaskApi, controlTaskApi } from "../api";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  const selectedTask = useMemo(() => {
    return tasks.find((t) => t.task_id === selectedTaskId) ?? tasks[0] ?? null;
  }, [selectedTaskId, tasks]);

  const refresh = useCallback(async () => {
    const data = await fetchTasks();
    setTasks(data.items);
    setSelectedTaskId((current) => current ?? data.items[0]?.task_id ?? null);
    setInitialLoading(false);
  }, []);

  // Keep reference for WS-triggered refresh
  refreshRef.current = refresh;

  const updateFromWs = useCallback((payload: TaskProgressMessage) => {
    setTasks((current) => {
      let matched = false;
      const updated = current.map((task) => {
        if (task.task_id !== payload.task_id) return task;
        matched = true;
        return {
          ...task,
          title: payload.title || task.title,
          cover_url: payload.cover_url || task.cover_url,
          status: payload.status,
          stage: payload.stage,
          progress_current: payload.current,
          progress_total: payload.total,
          last_error: payload.message,
          updated_at: new Date().toISOString(),
        };
      });
      if (matched) return updated;
      // Unknown task via WS — don't create ghost, trigger a full refresh
      // to get the complete task object from the API.
      void refreshRef.current?.();
      return current;
    });
  }, []);

  const retryTask = useCallback(async (task: Task) => {
    await retryTaskApi(task.task_id);
    setSelectedTaskId(task.task_id);
  }, []);

  const controlTask = useCallback(async (task: Task, action: "pause" | "resume" | "cancel") => {
    const updated = await controlTaskApi(task.task_id, action);
    setSelectedTaskId(updated.task_id);
  }, []);

  const queueCounts = useMemo(() => ({
    all: tasks.length,
    active: tasks.filter((t) => ["pending", "queued", "running", "paused"].includes(t.status)).length,
    failed: tasks.filter((t) => t.status === "failed").length,
    partial: tasks.filter((t) => t.status === "partial").length,
    attention: tasks.filter((t) => ["failed", "partial"].includes(t.status)).length,
    completed: tasks.filter((t) => t.status === "completed").length,
  }), [tasks]);

  const runningTasks = useMemo(
    () => tasks.filter((t) => t.status === "running"),
    [tasks]
  );

  return {
    tasks,
    selectedTask,
    selectedTaskId,
    setSelectedTaskId,
    queueCounts,
    runningTasks,
    initialLoading,
    refresh,
    updateFromWs,
    retryTask,
    controlTask,
  };
}
