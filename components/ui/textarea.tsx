import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-24 w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none transition placeholder:text-ink-500 focus:border-mint-500 focus:ring-2 focus:ring-mint-500/20",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
