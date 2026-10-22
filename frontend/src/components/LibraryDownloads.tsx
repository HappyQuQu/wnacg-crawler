import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Download, Loader2, X } from "lucide-react";
import type { LibraryDownloadResult } from "../types";

export async function startLibraryDownloads(files: LibraryDownloadResult["ready"]): Promise<void> {
  for (const file of files) {
    const link = document.createElement("a");
    link.href = file.url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Each entry remains a separate browser download, with no combined archive.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
  }
}

export function LibraryDownloads({ result, busy, sending, onRetryAll, onClose }: {
  result: LibraryDownloadResult;
  busy: boolean;
  sending: boolean;
  onRetryAll: () => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  const failed = result.failed.length;
  const ready = result.ready.length;
  useEffect(() => {
    if (!expanded) return;
    const collapse = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setExpanded(false);
    };
    document.addEventListener("pointerdown", collapse);
    return () => document.removeEventListener("pointerdown", collapse);
  }, [expanded]);

  return (
    <section ref={ref} className={`library-downloads download-center ${expanded ? "expanded" : ""} ${failed ? "has-failures" : ""}`} aria-label="文件下载清单" onKeyDown={(event) => {
      if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); toggle.current?.focus(); }
    }}>
      <div className="download-center-summary">
        <span className="download-center-icon">{sending ? <Loader2 size={18} className="spin" /> : failed ? <AlertTriangle size={18} /> : <Download size={18} />}</span>
        <div className="download-center-copy" role="status"><strong>{sending && ready ? `正在发起 ${ready} 个下载` : ready ? `已发起 ${ready} 个下载` : "未能发起下载"}</strong><span>{failed ? `${failed} 项无法下载，查看原因` : "请在浏览器中查看下载进度"}</span></div>
        <button ref={toggle} className="download-center-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(!expanded)}>{expanded ? "收起" : failed ? "查看原因" : "查看清单"}<ChevronDown size={14} /></button>
        <button className="icon-button" title="关闭提示，不影响文件下载" aria-label="关闭下载清单" onClick={onClose}><X size={16} /></button>
      </div>
      <div id={bodyId} className="download-center-body" hidden={!expanded}>
        <p className="batch-hint">每项作品为一个独立 ZIP。未收到文件时，可允许浏览器连续下载，或点击下方文件链接重试。</p>
        <ul className="download-file-list">
          {result.failed.map((file) => <li key={file.manga_id} className="download-failure"><AlertTriangle size={14} /><span>ID {file.manga_id}：{file.error}</span></li>)}
          {result.ready.map((file) => <li key={file.manga_id}><Download size={14} /><a href={file.url} download={file.filename}>{file.filename}</a></li>)}
        </ul>
        <div className="download-center-footer"><span>{ready} 个独立文件{failed ? ` · ${failed} 项无法下载` : ""}</span><button className="button secondary" disabled={busy || !ready} onClick={onRetryAll}><Download size={14} />{sending ? "发起中…" : "重新发起全部"}</button></div>
      </div>
    </section>
  );
}
