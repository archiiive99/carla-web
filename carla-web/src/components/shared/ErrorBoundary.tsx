import { Component, type ErrorInfo, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  // Log the thrown error + React's component stack so devs actually see
  // the failure in devtools. Previously only getDerivedStateFromError ran,
  // so the UI flipped to "Something went wrong" but the console stayed
  // empty — no way to tell which sensor panel threw or what the stack
  // was. React 19 swallows the default rethrow in development when an
  // error boundary is present, so this is the only path.
  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(
      "[ErrorBoundary] Component render threw:",
      error,
      info.componentStack,
    );
  }
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
