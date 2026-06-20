import type { ReportFilters } from "@/lib/reports/types";
import { Search, X } from "lucide-react";
import Link from "next/link";

export function ReportsFilters({
  filters,
  options
}: {
  filters: ReportFilters;
  options: { categories: string[]; cities: string[]; areas: string[] };
}) {
  return (
    <form className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <Select name="status" label="الحالة" value={filters.status ?? ""}>
          <option value="">كل الحالات</option>
          <option value="approved">معتمد</option>
          <option value="rejected">مرفوض</option>
          <option value="needs_more_info">بحاجة لمعلومات</option>
          <option value="pending">بانتظار المراجعة</option>
        </Select>

        <Select name="severity" label="الخطورة" value={filters.severity ?? ""}>
          <option value="">كل الدرجات</option>
          <option value="low">منخفضة</option>
          <option value="medium">متوسطة</option>
          <option value="high">عالية</option>
          <option value="urgent">عاجلة</option>
        </Select>

        <Select name="category" label="التصنيف" value={filters.category ?? ""}>
          <option value="">كل التصنيفات</option>
          {options.categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>

        <Select name="city" label="المدينة" value={filters.city ?? ""}>
          <option value="">كل المدن</option>
          {options.cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Select>

        <Select name="area" label="المنطقة" value={filters.area ?? ""}>
          <option value="">كل المناطق</option>
          {options.areas.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </Select>

        <Input name="from" label="من" type="date" value={filters.from ?? ""} />
        <Input name="to" label="إلى" type="date" value={filters.to ?? ""} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button className="inline-flex items-center gap-2 rounded-md bg-charcoal-900 px-4 py-2 text-sm font-bold text-white hover:bg-charcoal-800">
          <Search className="size-4" aria-hidden="true" />
          تطبيق الفلاتر
        </button>
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-charcoal-900 hover:bg-stone-50"
        >
          <X className="size-4" aria-hidden="true" />
          مسح
        </Link>
      </div>
    </form>
  );
}

function Select({
  name,
  label,
  value,
  children
}: {
  name: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-stone-600">{label}</span>
      <select name={name} defaultValue={value} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm">
        {children}
      </select>
    </label>
  );
}

function Input({ name, label, type, value }: { name: string; label: string; type: string; value: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-stone-600">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={value}
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}
