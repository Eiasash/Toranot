import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Hebrew label shown in the error fallback */
  label?: string;
  /** Called when user clicks dismiss */
  onDismiss?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches runtime errors from inline components (Scanner, AIClinicalReasoning)
 * without taking down the entire app or PatientCard.
 *
 * Usage:
 *   <InlineErrorBoundary label="ניתוח קליני" onDismiss={() => setShowAI(false)}>
 *     <AIClinicalReasoning ... />
 *   </InlineErrorBoundary>
 */
export class InlineErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Toranot] ${this.props.label ?? "Component"} crashed:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300 font-medium">
            שגיאה ב{this.props.label ?? "רכיב"}
          </p>
          <p className="text-xs text-red-500 dark:text-red-400 font-mono break-all">
            {this.state.error.message}
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              this.props.onDismiss?.();
            }}
            className="px-4 py-2 min-h-[44px] text-sm font-semibold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 rounded-lg active:opacity-70"
          >
            סגור
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
