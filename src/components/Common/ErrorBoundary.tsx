import React, { Component, type ReactNode } from 'react';
import { DateUtils } from '../../engine/dateUtils';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled UI Exception caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleExportEmergencyBackup = () => {
    try {
      // The app persists each slice under its own `budget-control-*` key, so dump
      // everything this app owns instead of looking for a single state blob.
      const rawLocalStorage: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith('budget-control-') || key.includes('gist')) {
          rawLocalStorage[key] = localStorage.getItem(key) ?? '';
        }
      }
      const backupData = {
        exportedAt: new Date().toISOString(),
        version: '2.1-emergency',
        error: this.state.error ? this.state.error.toString() : null,
        rawLocalStorage,
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `budget-emergency-backup-${DateUtils.todayString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Emergency export failed: ${(e as Error).message}. You can manually copy localStorage in DevTools.`);
    }
  };

  handleResetStorage = () => {
    if (window.confirm('Are you sure you want to reset local data? If you have not exported a backup yet, please click "Export Emergency Backup" first!')) {
      try {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
      } catch {
        window.location.reload();
      }
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          background: 'var(--bg-app, #0f172a)',
          color: 'var(--text-main, #f8fafc)',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          boxSizing: 'border-box',
        }}>
          <div style={{
            maxWidth: '560px',
            width: '100%',
            background: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border, rgba(255,255,255,0.1))',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '32px' }}>⚠️</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Something went wrong</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted, #94a3b8)' }}>
                  Budget Control encountered an unexpected interface error.
                </p>
              </div>
            </div>

            <p style={{ fontSize: '14px', lineHeight: 1.5, marginBottom: '20px', color: 'var(--text-main, #cbd5e1)' }}>
              Your data in local storage is preserved. You can export an emergency copy of your budget data, reload the application, or reset if needed.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <button
                type="button"
                className="primary-button"
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                onClick={this.handleExportEmergencyBackup}
              >
                💾 Export Emergency Backup (JSON)
              </button>
              <button
                type="button"
                className="ghost-button"
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                onClick={() => window.location.reload()}
              >
                🔄 Reload Application
              </button>
              <button
                type="button"
                style={{
                  width: '100%',
                  background: 'transparent',
                  color: '#f43f5e',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  borderRadius: '8px',
                  padding: '10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
                onClick={this.handleResetStorage}
              >
                🗑️ Reset Corrupted Data & Start Fresh
              </button>
            </div>

            {this.state.error && (
              <details style={{ marginTop: '16px', fontSize: '12px', color: 'var(--muted, #94a3b8)' }}>
                <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Technical Error Details</summary>
                <pre style={{
                  padding: '10px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '6px',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
