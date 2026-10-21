import { Download, X } from "lucide-react";
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

export function LibraryDownloads({ result, busy, onRetryAll, onClose }: {
  result: LibraryDownloadResult;
  busy: boolean;
  onRetryAll: () => void;
  onClose: () => void;
}) {
  return (
    <section className="panel library-downloads" aria-label="文件下载清单">
      <div className="collection-downloads-header">
        <div><strong>文件下载清单</strong><span>{result.ready.length} 个独立文件{result.failed.length ? ` · ${result.failed.length} 项无法下载` : ""}</span></div>
        <div className="row-actions">
          <button className="button secondary" disabled={busy || !result.ready.length} onClick={onRetryAll}><Download size={14} />重新发起全部</button>
          <button className="icon-button" title="关闭下载清单" aria-label="关闭下载清单" disabled={busy} onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <p className="batch-hint">每个作品分别下载一个 ZIP。若浏览器拦截连续下载，请允许本站下载多个文件，或逐项点击下方链接。</p>
      <ul className="download-file-list">
        {result.ready.map((file) => <li key={file.manga_id}><Download size={14} /><a href={file.url} download={file.filename}>{file.filename}</a></li>)}
        {result.failed.map((file) => <li key={file.manga_id} className="download-failure">{file.manga_id}：{file.error}</li>)}
      </ul>
    </section>
  );
}
