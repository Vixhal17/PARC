import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 shadow-xs",
  {
    variants: {
      variant: {
        default: "bg-[#533afd] text-white hover:bg-[#4434d4] active:bg-[#2e2b8c] shadow-sm",
        outline:
          "border-[#e3e8ee] bg-white text-[#0d253d] hover:bg-[#f6f9fc] hover:text-[#533afd] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
        secondary:
          "bg-white text-[#533afd] border border-[#533afd]/30 hover:border-[#533afd] hover:bg-indigo-50/50 dark:bg-zinc-800 dark:text-indigo-400",
        ghost:
          "hover:bg-[#f6f9fc] hover:text-[#533afd] dark:hover:bg-zinc-800",
        destructive:
          "bg-[#ea2261]/10 text-[#ea2261] hover:bg-[#ea2261]/20 focus-visible:ring-[#ea2261]/20",
        dark: "bg-[#1c1e54] text-white hover:bg-[#0d253d]",
        link: "text-[#533afd] underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-2 px-4 py-2 text-sm",
        xs: "h-6 gap-1 px-2.5 text-xs",
        sm: "h-7.5 gap-1.5 px-3 text-xs",
        lg: "h-10 gap-2 px-5 text-base font-semibold",
        icon: "size-8 rounded-full",
        "icon-xs": "size-6 rounded-full",
        "icon-sm": "size-7 rounded-full",
        "icon-lg": "size-9 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
