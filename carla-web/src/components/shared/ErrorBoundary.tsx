import { Component, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <Card className="m-4" role="alert">
          <CardContent className="flex flex-col items-center gap-3 p-6">
            <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
            <p className="text-sm font-medium">Something went wrong</p>
            <p className="text-xs text-muted-foreground">{this.state.error?.message}</p>
            <Button size="sm" variant="outline" onClick={() => this.setState({ hasError: false, error: null })}>Try Again</Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
