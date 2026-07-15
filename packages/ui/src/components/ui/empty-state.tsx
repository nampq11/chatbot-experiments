"use client";

import type * as React from "react";
import { cn } from "../../lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "p-4 text-sm",
  md: "px-4 py-8 text-sm",
  lg: "p-8 text-base",
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center text-sidebar-foreground/60",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {icon && <div className="text-sidebar-foreground/40">{icon}</div>}
      {title && <p className="font-medium text-sidebar-foreground">{title}</p>}
      {(description || children) && <p>{description || children}</p>}
      {action}
    </div>
  );
}
