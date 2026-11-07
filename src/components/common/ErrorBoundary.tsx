import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[KEO AI] Uncaught render error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-slate-100">
          <div className="glass-strong mx-auto flex max-w-md flex-col items-center rounded-3xl p-6 sm:p-8">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-error-500/10 text-error-400">
              <AlertOctagon size={28} />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">KEO AI Encountered an Issue</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {this.state.error?.message || "An unexpected error occurred while rendering the interface."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="btn-ghost !px-4 !py-2.5 text-sm"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="btn-primary !px-4 !py-2.5 text-sm"
              >
                <RotateCcw size={16} /> Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
