import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-zinc-100 text-zinc-900",
        secondary: "border-transparent bg-zinc-800 text-zinc-200",
        outline: "border-zinc-700 text-zinc-300",
        green: "border-green-500/30 bg-green-500/10 text-green-400",
        blue: "border-blue-500/30 bg-blue-500/10 text-blue-400",
        purple: "border-purple-500/30 bg-purple-500/10 text-purple-400",
        muted: "border-zinc-500/30 bg-zinc-500/10 text-zinc-500",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
