import { ScriptPage } from "@/components/script-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ScriptPage slug={slug} />;
}
