"use client";

import { cn } from "@dentaltrip-ai/ui";
import {
  CalendarDays,
  CircleDollarSign,
  type LucideIcon,
  MapPinned,
  Stethoscope,
} from "lucide-react";

type StarterPrompt = {
  title: string;
  description: string;
  prompt: string;
  Icon: LucideIcon;
};

const STARTER_PROMPTS: StarterPrompt[] = [
  {
    title: "Estimate Vietnam treatment costs",
    description: "Price ranges, quote accuracy, and next details",
    prompt:
      "I’m considering dental treatment in Vietnam. Help me understand likely cost ranges and what details you need from me for a more accurate estimate.",
    Icon: CircleDollarSign,
  },
  {
    title: "Shortlist clinic options",
    description: "Match treatment, budget, travel dates, and support",
    prompt:
      "Help me narrow down clinic options in Vietnam. Ask only the few essential questions you need about treatment, budget, travel dates, and preferences.",
    Icon: MapPinned,
  },
  {
    title: "Plan treatment travel timing",
    description: "Trip length, recovery days, and follow-up windows",
    prompt:
      "Help me plan the travel timeline for dental treatment in Vietnam, including consultation, procedure, recovery, and follow-up.",
    Icon: CalendarDays,
  },
  {
    title: "Choose a treatment path",
    description: "Understand likely options before a consultation",
    prompt:
      "I’m not sure which dental treatment I need. Ask me questions to understand my concern and explain the likely options.",
    Icon: Stethoscope,
  },
];

type ChatStarterPromptsProps = {
  onSelectPrompt: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
};

/** Renders dental-tourism starter prompts that start a focused assistant flow. */
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
      <legend className="sr-only">Suggested dental trip questions</legend>
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
