import { PublicShell } from "@/components/public-shell";
import { FixUploadForm } from "@/components/fix-upload-form";

export const dynamic = "force-dynamic";

type SubmitPageProps = {
  params: Promise<{ permitId: string }>;
};

export default async function PublicSubmitPage({ params }: SubmitPageProps) {
  const { permitId } = await params;

  return (
    <PublicShell
      title="تقديم إصلاح"
      subtitle="ارفع صورة تثبت الإصلاح وأضف وصفاً قصيراً. سيراجع المشرف التقديم ويعتمد النقاط."
    >
      <div className="max-w-xl">
        <FixUploadForm permitId={permitId} />
      </div>
    </PublicShell>
  );
}
