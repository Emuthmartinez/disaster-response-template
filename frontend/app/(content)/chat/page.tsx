import dynamic from "next/dynamic";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";

const ChatPanel = dynamic(() => import("@/components/features/chat/ChatPanel"), {
  loading: () => (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 text-sm text-slate-500">
      Cargando chat…
    </section>
  ),
});

export const metadata: Metadata = pageMetadata({
  title: "Chat de voluntarios",
  description:
    "Coordina rescates, suministros y difusión con otros voluntarios en tiempo real.",
  path: "/chat",
});

export default function ChatPage() {
  return (
    <SubPageShell breadcrumb="Chat de voluntarios">
      <ChatPanel />
    </SubPageShell>
  );
}
