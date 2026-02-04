import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-[#ffb22c] data-[state=unchecked]:bg-[#e5e5ea]",
      "data-[state=unchecked]:shadow-inner",
      "transition-all duration-300 ease-in-out",
      "border-none outline-none",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[27px] w-[27px] rounded-full bg-white ring-0",
        "shadow-[0_2px_4px_rgba(0,0,0,0.2)] ring-1 ring-black/5",
        "transition-all duration-300 ease-in-out",
        "data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[2px]",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
