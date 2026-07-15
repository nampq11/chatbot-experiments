"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

import { cn } from "../../lib/utils";

/** Accessible dialog root built on Radix Dialog. */
const Dialog = DialogPrimitive.Root;

/** Element that opens an accessible dialog. */
const DialogTrigger = DialogPrimitive.Trigger;

/** Element that closes an accessible dialog. */
const DialogClose = DialogPrimitive.Close;

/** Portal target for dialog overlay and content. */
const DialogPortal = DialogPrimitive.Portal;

/** Semantic title for dialog content. */
const DialogTitle = DialogPrimitive.Title;

/** Optional semantic description for dialog content. */
const DialogDescription = DialogPrimitive.Description;

/** Full-screen dialog backdrop. */
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** Positioned dialog content surface. */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
        className,
      )}
      {...props}
    />
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
