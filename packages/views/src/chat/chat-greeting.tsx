import { cn } from "@dentaltrip-ai/ui";

interface ChatGreetingProps {
  userName?: string;
  hasMessages: boolean;
  className?: string;
}

/** Renders the chat heading for empty and active conversation states. */
export function ChatGreeting({
  userName,
  hasMessages,
  className,
}: ChatGreetingProps) {
  if (hasMessages) return <h1 className="sr-only">DentalTrip AI Chat</h1>;

  return (
    <h1
      className={cn(
        "mb-6 text-balance text-center text-xl font-semibold leading-8 text-foreground sm:text-2xl",
        className,
      )}
    >
      {getGreetingText({ userName })}
    </h1>
  );
}

function getGreetingText({ userName }: { userName?: string }): string {
  if (userName) {
    return `Good to see you, ${userName}. Let’s plan your dental trip.`;
  }
  return "Plan your dental trip to Vietnam";
}
