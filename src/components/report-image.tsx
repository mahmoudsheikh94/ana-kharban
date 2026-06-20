import { ImageOff } from "lucide-react";

export function ReportImage({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center rounded-md bg-stone-200 text-stone-500 ${className}`}>
        <ImageOff className="size-8" aria-hidden="true" />
      </div>
    );
  }

  return <img src={src} alt={alt} className={`rounded-md object-cover ${className}`} loading="lazy" />;
}
