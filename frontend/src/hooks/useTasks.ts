import { useCallback, useMemo, useState } from "react";
import type { Task, TaskProgressMessage } from "../types";
import { fetchTasks, retryTaskApi, controlTaskApi } from "../api";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const selectedTask = useMemo(() => {
    return tasks.find((t) => t.task_id === selectedTaskId) ?? tasks[0] ?? null;
  }, [selectedTaskId, tasks]);

  const refresh = useCallback(async () => {
    const data = await fetchTasks();
    setTasks(data.items);
    setSelectedTaskId((current) => current ?? data.items[0]?.task_id ?? null);
    setInitialLoading(false);
  }, []);

  const updateFromWs = useCallback((payload: TaskProgressMessage) => {
    setTasks((current) => {
      let matched = false;
      const updated = current.map((task) => {
        if (task.task_id !== payload.task_id) return task;
        matched = true;
        return {
          ...task,
          status: payload.status,
          stage: payload.stage,
          progress_current: payload.current,
          progress_total: payload.total,
          last_error: payload.message,
          updated_at: new Date().toISOString(),
        };
      });
      if (matched) return updated;
      return [
        {
          id: payload.task_id,
          task_id: payload.task_id,
          manga_id: payload.manga_id,
          title: "",
          cover_url: "",
          source: "websocket",
          status: payload.status,
          stage: payload.stage,
          progress_current: payload.current,
          progress_total: payload.total,
          retry_count: 0,
          last_error: payload.message,
          created_at: null,
          updated_at: new Date().toISOString(),
        },
        ...current,
      ];
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
    completed: tasks.filter((t) => t.status === "completed").length,
  }), [tasks]);

  const runningTasks = useMemo(
    () => tasks.filter((t) => ["running", "queued", "paused"].includes(t.status)).slice(0, 5),
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
