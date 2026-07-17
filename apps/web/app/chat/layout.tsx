import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Assistant for chatbot experiments",
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
