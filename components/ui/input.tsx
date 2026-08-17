import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-lavender-600/70 bg-lavender-900/30 px-3 text-sm text-ink-100 outline-none transition placeholder:text-lavender-200/40 focus:border-lavender-300 focus:ring-2 focus:ring-lavender-200/35",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
