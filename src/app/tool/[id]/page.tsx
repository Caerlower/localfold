import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTool, TOOLS } from "@/lib/tools";
import { ToolWorkspace } from "@/components/ToolWorkspace";
import { SiteFooter } from "@/components/SiteFooter";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ id: t.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tool = getTool(id);
  if (!tool) return { title: "Tool not found" };

  return {
    title: tool.title,
    description: `${tool.blurb} Private, in-browser — files never leave your device.`,
    openGraph: {
      title: `${tool.title} · LocalFold`,
      description: tool.blurb,
    },
  };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tool = getTool(id);
  if (!tool) notFound();

  return (
    <>
      <ToolWorkspace tool={tool} />
      <SiteFooter />
    </>
  );
}
