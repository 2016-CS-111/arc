import type { ButtonHTMLAttributes, ReactElement } from "react";

import { cn } from "../../lib/cn.js";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string;
};

export function IconButton({ className, label, ...props }: IconButtonProps): ReactElement {
  return (
    <button
      aria-label={label}
      className={cn(
        "group relative grid size-7 place-items-center rounded border border-transparent text-arc-muted outline-none transition-colors hover:bg-arc-hover hover:text-arc-foreground focus-visible:border-arc-focus focus-visible:ring-1 focus-visible:ring-arc-focus disabled:cursor-wait disabled:opacity-60",
        className,
      )}
      title={label}
      type="button"
      {...props}
    />
  );
}
