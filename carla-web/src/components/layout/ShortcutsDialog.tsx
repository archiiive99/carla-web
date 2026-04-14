import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Kbd } from "@/components/ui/kbd";

interface ShortcutRow {
  label: string;
  keys: React.ReactNode;
}

const SECTIONS: { title: string; rows: ShortcutRow[]; note?: string }[] = [
  {
    title: "Simulation (no ego vehicle)",
    rows: [
      { label: "Play / Pause", keys: <Kbd>Space</Kbd> },
      { label: "Step simulation", keys: <Kbd>N</Kbd> },
    ],
    note: "Space becomes Handbrake when an ego vehicle is selected.",
  },
  {
    title: "Driving (select vehicle first)",
    rows: [
      { label: "Throttle (70%)", keys: <Kbd>W</Kbd> },
      { label: "Brake (50%)", keys: <Kbd>S</Kbd> },
      {
        label: "Steer left / right (50%)",
        keys: (
          <div className="flex gap-1">
            <Kbd>A</Kbd>
            <Kbd>D</Kbd>
          </div>
        ),
      },
      { label: "Full throttle/steer", keys: <Kbd>Shift</Kbd> },
      { label: "Handbrake", keys: <Kbd>Space</Kbd> },
      { label: "Toggle reverse", keys: <Kbd>R</Kbd> },
    ],
  },
  {
    title: "View",
    rows: [
      { label: "Camera modes", keys: <Kbd>1-5</Kbd> },
      { label: "Fullscreen", keys: <Kbd>F</Kbd> },
      { label: "Performance overlay", keys: <Kbd>P</Kbd> },
      { label: "Toggle actors panel", keys: <Kbd>B</Kbd> },
      {
        label: "Toggle left / right / bottom panels",
        keys: (
          <div className="flex gap-1">
            <Kbd>[</Kbd>
            <Kbd>]</Kbd>
            <Kbd>\</Kbd>
          </div>
        ),
      },
    ],
  },
  {
    title: "Other",
    rows: [
      { label: "Command palette", keys: <Kbd>Ctrl+K</Kbd> },
      { label: "Focus actor search", keys: <Kbd>/</Kbd> },
      { label: "Deselect actor / close dialog", keys: <Kbd>Esc</Kbd> },
      { label: "Show shortcuts", keys: <Kbd>?</Kbd> },
    ],
  },
];

// Data-driven shortcuts dialog. The old inline version in TopBar was 50
// lines of hand-written JSX rows; driving from a config table means new
// shortcuts are a one-line addition and the JSX is uniform.
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Open keyboard shortcuts">
            <Kbd>?</Kbd>
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-1 text-xs">
          {SECTIONS.map((section, i) => (
            <div key={section.title}>
              <p className="text-2xs font-medium uppercase text-muted-foreground">
                {section.title}
              </p>
              {section.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between"
                >
                  <span>{row.label}</span>
                  {row.keys}
                </div>
              ))}
              {section.note && (
                <p className="mt-1 text-2xs italic text-muted-foreground">
                  {section.note}
                </p>
              )}
              {i < SECTIONS.length - 1 && <Separator className="my-1.5" />}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
