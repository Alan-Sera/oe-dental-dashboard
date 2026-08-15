import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-ink-700 bg-ink-900 px-3 text-sm text-ink-100 outline-none transition placeholder:text-ink-500 focus:border-mint-500 focus:ring-2 focus:ring-mint-500/20",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
