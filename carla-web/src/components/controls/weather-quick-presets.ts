import { Cloud, CloudFog, CloudRain, Moon, Sun, type LucideIcon } from "lucide-react";
import type { WeatherPreset } from "@/types/carla";

/** Quick-select weather presets shared by the WeatherControls popover and
 *  the CommandPalette. Keeping them in one table ensures both surfaces
 *  offer exactly the same five presets with the same icons/labels — drift
 *  here shows up as a different Clear/Rain/Night icon between the toolbar
 *  and the palette, which is disorienting. */
export interface WeatherQuickPreset {
  preset: WeatherPreset;
  label: string;
  icon: LucideIcon;
}

export const WEATHER_QUICK_PRESETS: readonly WeatherQuickPreset[] = [
  { preset: "ClearNoon", label: "Clear", icon: Sun },
  { preset: "CloudyNoon", label: "Cloudy", icon: Cloud },
  { preset: "HardRainNoon", label: "Rain", icon: CloudRain },
  { preset: "ClearNight", label: "Night", icon: Moon },
  { preset: "DustStorm", label: "Fog", icon: CloudFog },
];
