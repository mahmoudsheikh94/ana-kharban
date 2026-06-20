import { ImageOff } from "lucide-react";
import Image from "next/image";

export function ReportImage({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center rounded-md bg-stone-200 text-stone-500 ${className}`}>
        <ImageOff className="size-8" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-md bg-stone-200 ${className}`}>
      <Image src={src} alt={alt} fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover" />
    </div>
  );
}
