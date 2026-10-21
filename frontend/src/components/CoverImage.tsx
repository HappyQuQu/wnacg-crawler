import { useEffect, useRef, useState } from "react";
import { BookOpen, Maximize2, X } from "lucide-react";

export function CoverImage({ url, noImageMode, className, preview = false }: {
  url: string; noImageMode: boolean; className: string; preview?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const hasImage = !!url && failedUrl !== url;
  const classes = `${className} ${noImageMode ? "no-image-blur" : ""}`;
  const image = hasImage
    ? <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} />
    : <BookOpen size={28} aria-hidden="true" />;

  return <>
    {preview && hasImage && !noImageMode
      ? <button type="button" className={`${classes} cover-zoom-trigger`} aria-label="放大封面" onClick={() => setOpen(true)}>{image}<span className="cover-zoom-hint"><Maximize2 size={14} />放大查看</span></button>
      : <span className={classes}>{image}</span>}
    {open && hasImage && !noImageMode && <CoverPreview url={url} onClose={() => setOpen(false)} />}
  </>;
}

function CoverPreview({ url, onClose }: { url: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className="cover-preview" aria-label="封面大图" onCancel={(event) => { event.stopPropagation(); onClose(); }} onClose={(event) => { event.stopPropagation(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="cover-preview-heading"><span>作品封面</span><button type="button" className="icon-button" aria-label="关闭封面大图" onClick={onClose} autoFocus><X size={20} /></button></div>
    <img src={url} alt="作品完整封面" />
  </dialog>;
}
