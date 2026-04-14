import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Camera, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { saveJson } from "@/lib/data-export";
import { useActorStore } from "@/stores/actorStore";
import { carlaApi } from "@/lib/carla-api";

export function DataExportMenu() {
  const actors = useActorStore((s) => s.actors);

  const exportActors = () => {
    const data = Array.from(actors.values()).map((a) => ({
      id: a.id,
      type_id: a.type_id,
      type: a.type,
      transform: a.transform,
      velocity: a.velocity,
    }));
    saveJson(data, `actors_${Date.now()}.json`);
    toast.success(`Exported ${data.length} actors`);
  };

  const exportWeather = async () => {
    try {
      const weather = await carlaApi.getWeather();
      saveJson(weather, `weather_${Date.now()}.json`);
      toast.success("Weather exported");
    } catch {
      toast.error("Export weather failed");
    }
  };

  const screenshotViewport = () => {
    // Prefer a canvas tagged as the main viewport. Fall back to the largest
    // canvas on the page so we don't grab a tiny sensor minimap by mistake.
    const tagged = document.querySelector<HTMLCanvasElement>(
      "canvas[data-screenshot-target]",
    );
    const canvas =
      tagged ??
      Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas"))
        .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!canvas) {
      toast.error("No viewport canvas found");
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `viewport_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Viewport screenshot saved");
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" aria-label="Export data">
            <Download className="size-3" /> Export
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={screenshotViewport}>
          <Camera className="mr-2 size-3.5" aria-hidden="true" />
          Screenshot Viewport
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportActors}>
          <FileJson className="mr-2 size-3.5" aria-hidden="true" />
          Export Actors (JSON)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportWeather}>
          <FileSpreadsheet className="mr-2 size-3.5" aria-hidden="true" />
          Export Weather (JSON)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
