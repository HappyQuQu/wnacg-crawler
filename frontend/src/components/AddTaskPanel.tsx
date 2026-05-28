import { useState } from "react";
import { ListChecks, Plus, X } from "lucide-react";
import type { ParseResult } from "../types";
import { parseInput, batchCreateTasks } from "../api";
import { StatusBadge } from "./Common";

export function AddTaskPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!open) return null;

  async function handleParse() {
    if (!input.trim()) {
      setParseResult(null);
      return;
    }
    setLoading(true);
    try {
      const data = await parseInput(input);
      setParseResult(data);
      setMessage(`解析完成：有效 ${data.summary.valid}，重复 ${data.summary.duplicate}`);
    } catch {
      setMessage("解析失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    const items = (parseResult?.items ?? [])
      .filter((i) => i.valid && i.manga_id && ["ready", "partial"].includes(i.status))
      .map((i) => ({ manga_id: i.manga_id as string }));
    if (items.length === 0) {
      setMessage("没有可加入队列的项目");
      return;
    }
    setLoading(true);
    try {
      const data = await batchCreateTasks(items);
      setMessage(`已创建 ${data.created.length} 个任务`);
      setInput("");
      setParseResult(null);
      await onCreated();
      setTimeout(onClose, 800);
    } catch {
      setMessage("创建失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setInput("");
    setParseResult(null);
    setMessage("");
    onClose();
  }

  return (
    <div className="add-panel-overlay" onClick={handleClose}>
      <div className="add-panel" onClick={(e) => e.stopPropagation()}>
        <div className="add-panel-header">
          <h2>添加任务</h2>
          <button className="icon-button" onClick={handleClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="add-panel-body">
          <label className="field-label" htmlFor="add-task-input">
            输入 ID 或链接（支持批量，每行一个）
          </label>
          <textarea
            id="add-task-input"
            value={input}
            placeholder={"123456\nhttps://www.wnacg.com/photos-index-page-1-aid-298731.html\n298731, 298732"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleParse();
              }
            }}
            autoFocus
          />

          <div className="add-panel-actions">
            <button className="button primary" onClick={handleParse} disabled={loading || !input.trim()}>
              <ListChecks size={15} />{loading ? "处理中" : "解析预检"}
            </button>
          </div>
        </div>

        {parseResult && (
          <div className="add-panel-results">
            <div className="add-panel-summary">
              <span>有效 <strong>{parseResult.summary.valid}</strong></span>
              <span>重复 <strong>{parseResult.summary.duplicate}</strong></span>
              <span>无效 <strong>{parseResult.summary.invalid}</strong></span>
            </div>
            <div className="add-panel-items">
              {parseResult.items.map((item, i) => (
                <div key={`${item.raw}-${i}`} className="add-panel-item">
                  <span className="mono">{item.manga_id ?? "?"}</span>
                  <span className="add-panel-item-title">{item.title || item.raw}</span>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
            <div className="add-panel-footer">
              {message && <span className="add-panel-message">{message}</span>}
              <button
                className="button primary"
                onClick={handleAdd}
                disabled={loading || parseResult.summary.valid === 0}
              >
                <Plus size={15} />加入队列
              </button>
            </div>
          </div>
        )}

        {!parseResult && message && (
          <div className="add-panel-results">
            <p className="add-panel-message">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
