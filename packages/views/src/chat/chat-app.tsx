"use client";

import { SidebarProvider } from "@chatbot-experiments/ui/components/ui/sidebar";
import { ChatContent } from "./chat-content";
import { ChatSidebar } from "./chat-sidebar";
import { DeleteSessionDialog } from "./delete-session-dialog";

export function ChatApp() {
  return (
    <SidebarProvider>
      <div className="relative flex h-dvh min-h-0 min-w-0 w-full overflow-hidden bg-background">
        <ChatSidebar />
        <ChatContent />
      </div>
      <DeleteSessionDialog />
    </SidebarProvider>
  );
}
