"use client";

import { cn } from "@chatbot-experiments/ui";
import {
  BarChart3,
  Bot,
  ClipboardCheck,
  type LucideIcon,
  Workflow,
} from "lucide-react";

type StarterPrompt = {
  title: string;
  description: string;
  prompt: string;
  Icon: LucideIcon;
};

const STARTER_PROMPTS: StarterPrompt[] = [
  {
    title: "Scope a chatbot experiment",
    description: "Goal, audience, constraints, and success metrics",
    prompt:
      "Help me scope a chatbot experiment. Ask only the essential questions about the goal, target users, constraints, and how we should measure success.",
    Icon: ClipboardCheck,
  },
  {
    title: "Compare model options",
    description: "Quality, latency, cost, and reliability tradeoffs",
    prompt:
      "Help me compare model options for a chatbot prototype. Focus on quality, latency, cost, reliability, and what we should test before deciding.",
    Icon: BarChart3,
  },
  {
    title: "Design a conversation flow",
    description: "Prompts, states, fallbacks, and handoff paths",
    prompt:
      "Help me design a conversation flow for a chatbot workflow, including key prompts, user states, fallback behavior, and handoff paths.",
    Icon: Workflow,
  },
  {
    title: "Plan chatbot evaluation",
    description: "Test cases, metrics, logs, and iteration plan",
    prompt:
      "Help me plan an evaluation for a chatbot prototype. Suggest test cases, metrics, logging, and how to use the results for the next iteration.",
    Icon: Bot,
  },
];

type ChatStarterPromptsProps = {
  onSelectPrompt: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
};

/** Renders starter prompts that start a focused chatbot experiment flow. */
export function ChatStarterPrompts({
  onSelectPrompt,
  disabled = false,
  className,
}: ChatStarterPromptsProps) {
  return (
    <fieldset
      className={cn(
        "grid min-w-0 grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-2 sm:gap-2.5",
        className,
      )}
    >
      <legend className="sr-only">
        Suggested chatbot experiment questions
      </legend>
      {STARTER_PROMPTS.map(({ title, description, prompt, Icon }) => (
        <button
          key={title}
          type="button"
          disabled={disabled}
          onClick={() => onSelectPrompt(prompt)}
          className={cn(
            "group flex min-h-[72px] origin-center items-start gap-3 rounded-2xl border border-border/60 bg-background/75 p-3 text-left shadow-none",
            "transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.985]",
            "[@media(hover:hover)_and_(pointer:fine)]:hover:border-ring/25 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/35",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:pointer-events-none disabled:opacity-60 motion-reduce:active:scale-100 motion-reduce:transition-none",
          )}
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground transition-[background-color,color] duration-150 [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-background [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-foreground motion-reduce:transition-none">
            <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="min-w-0 space-y-1">
            <span className="block text-pretty text-sm font-medium leading-5 text-foreground">
              {title}
            </span>
            <span className="block text-pretty text-xs leading-4 text-muted-foreground">
              {description}
            </span>
          </span>
        </button>
      ))}
    </fieldset>
  );
}
