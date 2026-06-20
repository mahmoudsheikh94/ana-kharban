import { blockUserAction, unblockUserAction } from "@/app/abuse/actions";
import { AppShell } from "@/components/app-shell";
import { getTelegramAbuseAdminData } from "@/lib/supabase/ingestion";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

export const dynamic = "force-dynamic";

export default async function AbusePage() {
  const data = await getTelegramAbuseAdminData();
  const aiByUser = data.aiUsageToday.reduce<Record<string, number>>((accumulator, event) => {
    accumulator[event.telegram_user_id] = (accumulator[event.telegram_user_id] ?? 0) + 1;
    return accumulator;
  }, {});

  const suspiciousUsers = Object.entries(aiByUser).sort((a, b) => b[1] - a[1]);

  return (
    <AppShell title="الحماية من الإساءة" subtitle="مراقبة استخدام Telegram وGemini، وحظر الحسابات المسيئة.">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="text-sm font-semibold text-stone-500">استخدام Gemini اليوم</p>
          <p className="mt-2 text-3xl font-black text-charcoal-950">{data.aiUsageToday.length}</p>
        </section>
        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="text-sm font-semibold text-stone-500">المستخدمون المحظورون</p>
          <p className="mt-2 text-3xl font-black text-charcoal-950">{data.blockedUsers.length}</p>
        </section>
        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="text-sm font-semibold text-stone-500">أحداث إساءة آخر 100 حدث</p>
          <p className="mt-2 text-3xl font-black text-charcoal-950">{data.events.length}</p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-5 py-4">
            <h3 className="text-lg font-black text-charcoal-950">أحداث الحماية</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-right text-xs font-bold uppercase text-stone-500">
                <tr>
                  <th className="px-5 py-3">Telegram ID</th>
                  <th className="px-5 py-3">الحدث</th>
                  <th className="px-5 py-3">التفاصيل</th>
                  <th className="px-5 py-3">الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-5 py-3 font-mono text-xs">{event.telegram_user_id}</td>
                    <td className="px-5 py-3 font-semibold text-charcoal-900">{event.event_type}</td>
                    <td className="max-w-md truncate px-5 py-3 text-xs text-stone-500">
                      {JSON.stringify(event.detail)}
                    </td>
                    <td className="px-5 py-3 text-stone-500">
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: ar })}
                    </td>
                  </tr>
                ))}
                {data.events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-stone-500">
                      لا توجد أحداث إساءة مسجلة.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h3 className="text-lg font-black text-charcoal-950">حظر مستخدم</h3>
            <form action={blockUserAction} className="mt-4 space-y-3">
              <input
                name="telegramUserId"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                placeholder="Telegram user ID"
              />
              <input
                name="reason"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                placeholder="سبب الحظر"
              />
              <button className="w-full rounded-md bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800">
                حظر
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h3 className="text-lg font-black text-charcoal-950">الأكثر استخداماً لـ Gemini اليوم</h3>
            <div className="mt-4 space-y-3">
              {suspiciousUsers.map(([telegramUserId, count]) => (
                <div key={telegramUserId} className="flex items-center justify-between gap-3 rounded-md bg-stone-50 p-3">
                  <span className="font-mono text-xs">{telegramUserId}</span>
                  <span className="rounded-md bg-civic-yellow px-2 py-1 text-xs font-black text-charcoal-950">
                    {count}
                  </span>
                </div>
              ))}
              {suspiciousUsers.length === 0 ? <p className="text-sm text-stone-500">لا يوجد استخدام AI اليوم.</p> : null}
            </div>
          </section>

          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h3 className="text-lg font-black text-charcoal-950">المحظورون</h3>
            <div className="mt-4 space-y-3">
              {data.blockedUsers.map((user) => (
                <form
                  action={unblockUserAction}
                  key={user.telegram_user_id}
                  className="rounded-md border border-stone-200 p-3"
                >
                  <input type="hidden" name="telegramUserId" value={user.telegram_user_id} />
                  <p className="font-mono text-xs text-charcoal-900">{user.telegram_user_id}</p>
                  <p className="mt-1 text-xs text-stone-500">{user.reason}</p>
                  <button className="mt-3 rounded-md border border-stone-300 px-3 py-1.5 text-xs font-bold text-charcoal-900 hover:bg-stone-50">
                    إلغاء الحظر
                  </button>
                </form>
              ))}
              {data.blockedUsers.length === 0 ? <p className="text-sm text-stone-500">لا يوجد مستخدمون محظورون.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
