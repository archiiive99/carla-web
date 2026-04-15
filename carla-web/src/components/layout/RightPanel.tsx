
import { Separator } from "@/components/ui/separator";
import { ActorDetails } from "@/components/actors/ActorDetails";

export function RightPanel() {
  return (
    <aside
      aria-label="Actor properties"
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-sidebar text-sidebar-foreground shadow-sm"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">Properties</h2>
      </div>
      <Separator />
      <div className="flex-1 overflow-hidden">
        <ActorDetails />
      </div>
    </aside>
  );
}
