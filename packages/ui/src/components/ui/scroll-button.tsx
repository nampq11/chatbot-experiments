"use client";

import type { VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { CHAT_CONTAINER_RESUME_FOLLOW_EVENT } from "../../chat-container";
import { usePrefersReducedMotion } from "../../hooks/use-prefers-reduced-motion";
import { cn } from "../../lib/utils";
import { Button, type buttonVariants } from "./button";

export type ScrollButtonProps = {
  className?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

function ScrollButton({
  className,
  variant = "outline",
  size = "sm",
  "aria-label": ariaLabel = "Scroll to Latest Message",
  ...props
}: ScrollButtonProps) {
  const { isAtBottom, scrollRef, scrollToBottom } = useStickToBottomContext();
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <Button
      variant={variant}
      size={size}
      aria-label={ariaLabel}
      className={cn(
        "h-10 w-10 rounded-full transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
        !isAtBottom
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-4 scale-95 opacity-0",
        className,
      )}
      onClick={() => {
        scrollRef.current?.dispatchEvent(
          new Event(CHAT_CONTAINER_RESUME_FOLLOW_EVENT),
        );
        void scrollToBottom(prefersReducedMotion ? "instant" : undefined);
      }}
      {...props}
    >
      <ChevronDown className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
}

export { ScrollButton };
