import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';

type Props = { children: ReactNode };

type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
          <div className="card max-w-md text-center">
            <div className="card-body">
              <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
              <p className="mt-2 text-sm text-slate-600">
                We encountered an error. Please try again.
              </p>
              <Button
                variant="primary"
                className="mt-6"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
