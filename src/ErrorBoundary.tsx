import { Component, type ErrorInfo, type ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Christmas Poker rendering failed', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <main className="setup" role="alert">
      <h1>Christmas Poker could not render</h1>
      <p>Reload the page. If this continues, share the message below.</p>
      <pre className="debug">{this.state.error.message}</pre>
      <button onClick={() => location.reload()}>Reload page</button>
    </main>;
  }
}
