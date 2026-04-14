
import { useRef, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Cloud, ChevronDown, RotateCcw } from "lucide-react";
import { useSimulationStore, useIsConnected } from "@/stores/simulationStore";
import type { CarlaWeatherParams } from "@/types/carla";
import { WEATHER_SLIDER_DEBOUNCE_MS } from "@/constants";
import { WEATHER_QUICK_PRESETS } from "./weather-quick-presets";

const PRESET_GROUPS = [
  {
    label: "Noon",
    presets: ["ClearNoon", "CloudyNoon", "WetNoon", "WetCloudyNoon", "MidRainyNoon", "HardRainNoon", "SoftRainNoon"],
  },
  {
    label: "Sunset",
    presets: ["ClearSunset", "CloudySunset", "WetSunset", "WetCloudySunset", "MidRainSunset", "HardRainSunset", "SoftRainSunset"],
  },
  {
    label: "Night",
    presets: ["ClearNight", "CloudyNight", "WetNight", "WetCloudyNight", "SoftRainNight", "MidRainyNight", "HardRainNight"],
  },
  { label: "Special", presets: ["DustStorm"] },
];

interface ParamDef {
  key: keyof CarlaWeatherParams;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const PARAMS: ParamDef[] = [
  { key: "sun_altitude_angle", label: "Sun Altitude", min: -90, max: 90, step: 1, unit: "°" },
  { key: "sun_azimuth_angle", label: "Sun Azimuth", min: 0, max: 360, step: 1, unit: "°" },
  { key: "cloudiness", label: "Cloudiness", min: 0, max: 100, step: 1, unit: "%" },
  { key: "precipitation", label: "Precipitation", min: 0, max: 100, step: 1, unit: "%" },
  { key: "precipitation_deposits", label: "Precip. Deposits", min: 0, max: 100, step: 1, unit: "%" },
  { key: "wind_intensity", label: "Wind Intensity", min: 0, max: 100, step: 1, unit: "%" },
  { key: "fog_density", label: "Fog Density", min: 0, max: 100, step: 1, unit: "%" },
  { key: "fog_distance", label: "Fog Distance", min: 0, max: 500, step: 5, unit: "m" },
  { key: "fog_falloff", label: "Fog Falloff", min: 0, max: 5, step: 0.1, unit: "" },
  { key: "wetness", label: "Wetness", min: 0, max: 100, step: 1, unit: "%" },
  { key: "dust_storm", label: "Dust Storm", min: 0, max: 100, step: 1, unit: "%" },
  { key: "scattering_intensity", label: "Scattering", min: 0, max: 5, step: 0.1, unit: "" },
  { key: "mie_scattering_scale", label: "Mie Scattering", min: 0, max: 5, step: 0.1, unit: "" },
  { key: "rayleigh_scattering_scale", label: "Rayleigh Scattering", min: 0, max: 5, step: 0.1, unit: "" },
];

function WeatherSlider({
  param,
  value,
  onChange,
}: {
  param: ParamDef;
  value: number;
  onChange: (key: keyof CarlaWeatherParams, val: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{param.label}</Label>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {value.toFixed(param.step < 1 ? 1 : 0)}
          {param.unit}
        </span>
      </div>
      <Slider
        min={param.min}
        max={param.max}
        step={param.step}
        value={[value]}
        aria-label={param.label}
        onValueChange={(v) => onChange(param.key, Array.isArray(v) ? v[0] : v)}
      />
    </div>
  );
}

export function WeatherControls() {
  const weather = useSimulationStore((s) => s.weather);
  const setWeather = useSimulationStore((s) => s.setWeather);
  const setWeatherPreset = useSimulationStore((s) => s.setWeatherPreset);
  const isConnected = useIsConnected();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleParamChange = useCallback(
    (key: keyof CarlaWeatherParams, value: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setWeather({ [key]: value }).catch(() => {});
      }, WEATHER_SLIDER_DEBOUNCE_MS);
    },
    [setWeather],
  );

  return (
    <Popover>
      <PopoverTrigger render={
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          disabled={!isConnected}
          title={isConnected ? "Weather settings" : "Connect to CARLA first"}
          aria-label="Open weather controls"
        >
          <Cloud className="size-3" aria-hidden="true" /> Weather
        </Button>
      } />
      <PopoverContent className="w-80 p-0" align="end">
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-3 p-4">
            <h4 className="text-sm font-medium">Weather</h4>

            {/* Quick presets — shared with the CommandPalette weather group
                via `weather-quick-presets.ts` so both surfaces agree. */}
            <div className="flex flex-wrap gap-1">
              {WEATHER_QUICK_PRESETS.map(({ preset, label, icon: Icon }) => (
                <Button
                  key={preset}
                  variant="outline"
                  size="sm"
                  className="gap-1 px-2 text-xs"
                  onClick={() => {
                    setWeatherPreset(preset).catch(() => {});
                  }}
                  aria-label={`Apply ${label} weather preset`}
                >
                  <Icon className="size-3" aria-hidden="true" />
                  {label}
                </Button>
              ))}
            </div>

            <Separator />

            <Select
              onValueChange={(v) => {
                setWeatherPreset(v as Parameters<typeof setWeatherPreset>[0]).catch(() => {});
              }}
            >
              <SelectTrigger className="w-full" aria-label="Select weather preset">
                <SelectValue placeholder="Select preset..." />
              </SelectTrigger>
              <SelectContent>
                {PRESET_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </div>
                    {group.presets.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs">
                        {p.replace(/([A-Z])/g, " $1").trim()}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>

            <Separator />

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground">
                Advanced Parameters
                <ChevronDown
                  className={`size-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 space-y-3">
                  {PARAMS.map((param) => (
                    <WeatherSlider
                      key={param.key}
                      param={param}
                      value={weather[param.key]}
                      onChange={handleParamChange}
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    onClick={() => setWeatherPreset("ClearNoon").catch(() => {})}
                    aria-label="Reset weather to Clear Noon"
                  >
                    <RotateCcw className="size-3" aria-hidden="true" />
                    Reset to Clear Noon
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
