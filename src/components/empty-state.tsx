import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, message }: { icon: LucideIcon; title: string; message: string }) {
  return (
    <section className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-md bg-stone-100 text-stone-500">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-charcoal-950">{title}</h3>
      <p className="mt-2 text-sm text-stone-600">{message}</p>
    </section>
  );
}
