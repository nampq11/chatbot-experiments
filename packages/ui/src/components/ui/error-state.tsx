"use client";

import type * as React from "react";
import { cn } from "../../lib/utils";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "px-3 py-2 text-xs",
  md: "px-4 py-3 text-sm",
  lg: "px-6 py-4 text-base",
};

export function ErrorState({
  message,
  size = "md",
  className,
  children,
  ...props
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "text-center text-destructive",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {message || children}
    </div>
  );
}
