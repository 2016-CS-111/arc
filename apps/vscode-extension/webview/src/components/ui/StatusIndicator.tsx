import { cva } from "class-variance-authority";
import { CheckCircle2, CircleAlert, LoaderCircle, MinusCircle } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "../../lib/cn.js";

export type StatusTone = "idle" | "ready" | "warning" | "error";

const toneClasses = cva("shrink-0", {
  variants: {
    tone: {
      error: "text-arc-danger",
      idle: "text-arc-muted",
      ready: "text-arc-success",
      warning: "text-arc-warning",
    },
  },
});

export function StatusIndicator({ tone }: { readonly tone: StatusTone }): ReactElement {
  const className = toneClasses({ tone });

  switch (tone) {
    case "ready":
      return <CheckCircle2 aria-hidden="true" className={className} size={16} strokeWidth={1.8} />;
    case "warning":
      return <CircleAlert aria-hidden="true" className={className} size={16} strokeWidth={1.8} />;
    case "error":
      return <CircleAlert aria-hidden="true" className={className} size={16} strokeWidth={1.8} />;
    case "idle":
      return <MinusCircle aria-hidden="true" className={className} size={16} strokeWidth={1.8} />;
  }
}

export function RefreshIndicator({ spinning }: { readonly spinning: boolean }): ReactElement {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={cn("size-3.5", spinning ? "animate-spin" : "hidden")}
      strokeWidth={1.8}
    />
  );
}
