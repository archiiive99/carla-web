import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Maximize, Minimize } from "lucide-react";
import { reportError } from "@/lib/utils";

const OVERLAY_ICON_BTN =
  "border border-border/60 bg-overlay-bg/70 text-overlay-fg hover:bg-overlay-bg/85";

/** Self-contained fullscreen toggle for the viewport chrome. Tracks its
 *  own browser-fullscreen state via the `fullscreenchange` event so the
 *  MainViewport doesn't have to thread that state through just to render
 *  an icon + tooltip. */
export function FullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className={OVERLAY_ICON_BTN}
            onClick={() =>
              isFullscreen
                ? document.exitFullscreen().catch((e) =>
                    reportError("Exit fullscreen", e),
                  )
                : document.documentElement
                    .requestFullscreen()
                    .catch((e) => reportError("Enter fullscreen", e))
            }
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize className="size-3" aria-hidden="true" />
            ) : (
              <Maximize className="size-3" aria-hidden="true" />
            )}
          </Button>
        }
      />
      <TooltipContent side="right">
        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        <span className="ml-1 text-muted-foreground">F</span>
      </TooltipContent>
    </Tooltip>
  );
}
