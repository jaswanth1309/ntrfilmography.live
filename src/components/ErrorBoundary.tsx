import React from "react";

interface Props {
  children?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error in React render loop:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div id="error-boundary-screen" className="min-h-screen flex items-center justify-center bg-[#090a0f] text-white font-sans p-6">
          <div className="max-w-md w-full bg-[#11131e]/80 border border-[#1e2238] rounded-2xl p-8 backdrop-blur-md shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-red-950/40 border border-red-500/30 text-red-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-medium tracking-tight text-gray-100">Something went wrong</h1>
              <p className="text-sm text-gray-400 leading-relaxed">
                The application encountered an unexpected error and could not complete the render.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-[#05060a] border border-[#161a29] rounded-lg p-3 text-left font-mono text-[11px] text-red-400/90 overflow-x-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold rounded-xl text-sm transition-all duration-200 active:scale-[0.98] cursor-pointer shadow-lg shadow-amber-500/10"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
