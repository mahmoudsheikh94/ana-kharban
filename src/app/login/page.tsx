import { AlertTriangle, LockKeyhole } from "lucide-react";
import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-charcoal-950 px-4 py-12 text-white">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-white p-8 text-charcoal-900 shadow-panel">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-md bg-civic-yellow text-charcoal-950">
            <LockKeyhole className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm text-stone-500">لوحة إدارة البلاغات</p>
            <h1 className="text-2xl font-bold">أنا خربان</h1>
          </div>
        </div>

        {hasError ? (
          <div className="mb-5 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>كلمة المرور غير صحيحة. حاول مرة أخرى.</p>
          </div>
        ) : null}

        <form action={loginAction} className="space-y-5">
          <input type="text" name="username" value="admin" autoComplete="username" readOnly hidden />
          <label className="block space-y-2">
            <span className="text-sm font-semibold">كلمة مرور المسؤول</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-right text-charcoal-900 shadow-sm transition focus:border-civic-amber"
              required
            />
          </label>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-md bg-charcoal-900 px-4 py-3 font-bold text-white transition hover:bg-charcoal-800"
          >
            دخول لوحة التحكم
          </button>
        </form>
      </section>
    </main>
  );
}
