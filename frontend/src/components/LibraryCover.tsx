import { CoverImage } from "./CoverImage";

export function LibraryCover({ url, noImageMode, preview = false }: { url: string; noImageMode: boolean; preview?: boolean }) {
  return <CoverImage url={url} noImageMode={noImageMode} className="collection-cover" preview={preview} />;
}
