import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

// react-resizable-panels v4 renamed its exports (PanelGroup → Group,
// PanelResizeHandle → Separator) and no longer emits a direction data-attribute,
// so the vertical variants are driven off the `orientation` prop instead of the
// old `data-[panel-group-direction=vertical]:` selectors, which would now be
// dead CSS that silently never matches.
const ResizablePanelGroup = ({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizablePrimitive.Group
    orientation={orientation}
    className={cn("flex h-full w-full", orientation === "vertical" && "flex-col", className)}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
  orientation?: "horizontal" | "vertical";
}) => (
  <ResizablePrimitive.Separator
    className={cn(
      "relative flex items-center justify-center bg-border after:absolute focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      orientation === "vertical"
        ? "h-px w-full after:left-0 after:h-1 after:w-full after:-translate-y-1/2 [&>div]:rotate-90"
        : "w-px after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </ResizablePrimitive.Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
