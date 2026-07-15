"use client";

import { cn } from "../../lib/utils";

export type LoaderProps = {
  variant?:
    | "circular"
    | "classic"
    | "pulse"
    | "pulse-dot"
    | "dots"
    | "typing"
    | "wave"
    | "bars"
    | "terminal"
    | "text-blink"
    | "text-shimmer"
    | "loading-dots";
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
};

export type CircularLoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type ClassicLoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type PulseLoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type PulseDotLoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type DotsLoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type TypingLoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type WaveLoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type BarsLoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type TerminalLoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type TextBlinkLoaderProps = {
  text?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type TextShimmerLoaderProps = {
  text?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export type TextDotsLoaderProps = {
  text?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function CircularLoader({ size = "md", className }: CircularLoaderProps) {
  const sizes = {
    sm: "h-4 w-4 border-[2px]",
    md: "h-6 w-6 border-[3px]",
    lg: "h-8 w-8 border-[4px]",
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-primary border-t-transparent",
        sizes[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading</span>
    </div>
  );
}

function ClassicLoader({ size = "md", className }: ClassicLoaderProps) {
  const dotSizes = {
    sm: "h-1 w-1",
    md: "h-1.5 w-1.5",
    lg: "h-2 w-2",
  };

  const containerSizes = {
    sm: "gap-1",
    md: "gap-1.5",
    lg: "gap-2",
  };

  return (
    <div className={cn("flex items-center", containerSizes[size], className)}>
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "bg-primary animate-[loading-dots_1.4s_infinite] rounded-full",
            dotSizes[size],
          )}
          style={{
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

function PulseLoader({ size = "md", className }: PulseLoaderProps) {
  const sizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-6 w-6",
  };

  return (
    <div
      className={cn(
        "bg-primary animate-[pulse_2s_ease-in-out_infinite] rounded-full",
        sizes[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading</span>
    </div>
  );
}

function PulseDotLoader({ size = "md", className }: PulseDotLoaderProps) {
  const dotSizes = {
    sm: "h-1.5 w-1.5",
    md: "h-2 w-2",
    lg: "h-3 w-3",
  };

  const containerSizes = {
    sm: "gap-1.5",
    md: "gap-2",
    lg: "gap-3",
  };

  return (
    <div
      className={cn(
        "flex items-center text-primary",
        containerSizes[size],
        className,
      )}
    >
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full bg-current motion-reduce:animate-none",
            dotSizes[size],
          )}
          style={{
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

function DotsLoader({ size = "md", className }: DotsLoaderProps) {
  const sizes = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div className={cn("relative", sizes[size], className)}>
      <div className="absolute inset-0 animate-[spin_2s_linear_infinite]">
        <div className="absolute top-0 h-1/2 w-full overflow-hidden">
          <div className="bg-primary h-full w-full rounded-tl-full rounded-tr-full" />
        </div>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

function TypingLoader({ size = "md", className }: TypingLoaderProps) {
  const dotSizes = {
    sm: "h-1.5 w-1.5",
    md: "h-2 w-2",
    lg: "h-3 w-3",
  };

  const containerSizes = {
    sm: "gap-1",
    md: "gap-1.5",
    lg: "gap-2",
  };

  return (
    <div className={cn("flex items-center", containerSizes[size], className)}>
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "bg-primary animate-[typing_1s_ease-in-out_infinite] rounded-full",
            dotSizes[size],
          )}
          style={{
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

function WaveLoader({ size = "md", className }: WaveLoaderProps) {
  const barWidths = {
    sm: "w-1",
    md: "w-1.5",
    lg: "w-2",
  };

  const containerSizes = {
    sm: "h-4 gap-0.5",
    md: "h-5 gap-0.75",
    lg: "h-6 gap-1",
  };

  return (
    <div className={cn("flex items-end", containerSizes[size], className)}>
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "bg-primary animate-[wave_1.2s_ease-in-out_infinite] rounded-full",
            barWidths[size],
          )}
          style={{
            animationDelay: `${i * 0.1}s`,
            height: `${70 + i * 10}%`,
          }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

function BarsLoader({ size = "md", className }: BarsLoaderProps) {
  const barWidths = {
    sm: "w-1",
    md: "w-1.5",
    lg: "w-2",
  };

  const containerSizes = {
    sm: "h-4 gap-0.5",
    md: "h-5 gap-0.75",
    lg: "h-6 gap-1",
  };

  return (
    <div className={cn("flex items-end", containerSizes[size], className)}>
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "bg-primary h-full animate-[wave-bars_1.2s_ease-in-out_infinite]",
            barWidths[size],
          )}
          style={{
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

function TerminalLoader({ size = "md", className }: TerminalLoaderProps) {
  const cursorSizes = {
    sm: "h-3 w-1.5",
    md: "h-4 w-2",
    lg: "h-5 w-2.5",
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const containerSizes = {
    sm: "h-4",
    md: "h-5",
    lg: "h-6",
  };

  return (
    <div
      className={cn(
        "flex items-center space-x-1",
        containerSizes[size],
        className,
      )}
    >
      <span className={cn("text-primary font-mono", textSizes[size])}>
        {">"}
      </span>
      <div
        className={cn(
          "bg-primary animate-[blink_1s_step-end_infinite]",
          cursorSizes[size],
        )}
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}

function TextBlinkLoader({
  text = "Thinking",
  size = "md",
  className,
}: TextBlinkLoaderProps) {
  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <div
      className={cn(
        "animate-[text-blink_2s_ease-in-out_infinite] font-medium",
        textSizes[size],
        className,
      )}
    >
      {text}
    </div>
  );
}

function TextShimmerLoader({
  text = "Thinking",
  size = "md",
  className,
}: TextShimmerLoaderProps) {
  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <div
      className={cn(
        "relative inline-flex overflow-hidden font-medium text-muted-foreground",
        textSizes[size],
        className,
      )}
    >
      <span className="relative z-10">{text}</span>
      <span
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-1/2 motion-safe:animate-[shimmer-sweep_1.8s_linear_infinite] motion-reduce:hidden"
        aria-hidden="true"
      >
        <span className="block h-full -skew-x-12 bg-gradient-to-r from-transparent via-foreground/25 to-transparent" />
      </span>
    </div>
  );
}

function TextDotsLoader({
  text = "Thinking",
  size = "md",
  className,
}: TextDotsLoaderProps) {
  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <div className={cn("inline-flex items-center", className)}>
      <span className={cn("text-primary font-medium", textSizes[size])}>
        {text}
      </span>
      <span className="inline-flex">
        <span
          className={cn(
            "text-primary animate-[loading-dots_1.4s_infinite_0.2s]",
            textSizes[size],
          )}
        >
          .
        </span>
        <span
          className={cn(
            "text-primary animate-[loading-dots_1.4s_infinite_0.4s]",
            textSizes[size],
          )}
        >
          .
        </span>
        <span
          className={cn(
            "text-primary animate-[loading-dots_1.4s_infinite_0.6s]",
            textSizes[size],
          )}
        >
          .
        </span>
      </span>
    </div>
  );
}

function Loader({
  variant = "circular",
  size = "md",
  text,
  className,
}: LoaderProps) {
  switch (variant) {
    case "circular":
      return <CircularLoader size={size} className={className} />;
    case "classic":
      return <ClassicLoader size={size} className={className} />;
    case "pulse":
      return <PulseLoader size={size} className={className} />;
    case "pulse-dot":
      return <PulseDotLoader size={size} className={className} />;
    case "dots":
      return <DotsLoader size={size} className={className} />;
    case "typing":
      return <TypingLoader size={size} className={className} />;
    case "wave":
      return <WaveLoader size={size} className={className} />;
    case "bars":
      return <BarsLoader size={size} className={className} />;
    case "terminal":
      return <TerminalLoader size={size} className={className} />;
    case "text-blink":
      return <TextBlinkLoader text={text} size={size} className={className} />;
    case "text-shimmer":
      return (
        <TextShimmerLoader text={text} size={size} className={className} />
      );
    case "loading-dots":
      return <TextDotsLoader text={text} size={size} className={className} />;
    default:
      return <CircularLoader size={size} className={className} />;
  }
}

export {
  BarsLoader,
  CircularLoader,
  ClassicLoader,
  DotsLoader,
  Loader,
  PulseDotLoader,
  PulseLoader,
  TerminalLoader,
  TextBlinkLoader,
  TextDotsLoader,
  TextShimmerLoader,
  TypingLoader,
  WaveLoader,
};
