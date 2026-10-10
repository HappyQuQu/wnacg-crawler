import { BookOpen } from "lucide-react";
import { StatusBadge } from "./Common";

export function DetailSummary({ title, mangaId, coverUrl, status, noImageMode }: {
  title: string;
  mangaId: string;
  coverUrl: string;
  status: string;
  noImageMode: boolean;
}) {
  return (
    <div className="detail-summary">
      <div className={`detail-cover ${noImageMode ? "no-image-blur" : ""}`}>
        {coverUrl ? <img src={coverUrl} alt={title} /> : <BookOpen size={24} />}
      </div>
      <div className="detail-summary-text">
        <h3>{title}</h3>
        <div className="detail-summary-meta">
          <span className="mono">ID {mangaId}</span>
          <StatusBadge status={status} />
        </div>
      </div>
    </div>
  );
}
