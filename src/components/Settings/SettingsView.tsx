import React, { useState } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';
import { Cloud, Download, Upload, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    gistToken,
    gistId,
    gistAutoSync,
    setGistConfig,
    exportJSON,
    importJSON,
  } = useBudgetStore();

  const [token, setToken] = useState(gistToken);
  const [id, setId] = useState(gistId);
  const [autoSync, setAutoSync] = useState(gistAutoSync);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleSaveGistConfig = () => {
    setGistConfig(token.trim(), id.trim(), autoSync);
    setSyncStatus('GitHub Gist configuration saved successfully.');
    setTimeout(() => setSyncStatus(null), 3000);
  };

  const handleExport = () => {
    const data = exportJSON();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-control-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && importJSON(content)) {
        alert('Data successfully imported and restored!');
      } else {
        alert('Failed to parse backup JSON. Please check file format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: '1.35rem', fontFamily: 'var(--font-heading)', marginBottom: '0.5rem' }}>
        Settings &amp; Cloud Backup
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Manage your multi-device sync, offline backups, and cloud synchronization
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        {/* GitHub Gist Cloud Sync */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
            <Cloud size={18} color="#6366f1" />
            <span>GitHub Gist Multi-Device Cloud Sync</span>
          </div>

          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Sync your encrypted budget data seamlessly across your PC, iPhone, and Android device using a private GitHub Gist.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">GitHub Personal Access Token (PAT with gist scope)</label>
              <input
                type="password"
                className="form-input"
                placeholder="ghp_xxxxxxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Existing Gist ID (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Leave blank to create a new private Gist"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.25rem 0' }}>
              <input
                type="checkbox"
                id="autoSyncCheck"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
              />
              <label htmlFor="autoSyncCheck" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                Auto-sync on application startup &amp; every transaction change
              </label>
            </div>

            {syncStatus && (
              <div style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircle2 size={14} />
                <span>{syncStatus}</span>
              </div>
            )}

            <button className="btn btn-primary" onClick={handleSaveGistConfig}>
              Save Gist Cloud Settings
            </button>
          </div>
        </div>

        {/* Local JSON Backup & Restore */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
            <ShieldCheck size={18} color="#10b981" />
            <span>Data Backups &amp; Portability</span>
          </div>

          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Download an offline JSON copy of all your financial entries, salary patterns, credit rules, and assets, or restore from a previous backup.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button className="btn btn-secondary" onClick={handleExport} style={{ justifyContent: 'flex-start' }}>
              <Download size={16} />
              <span>Export Full Backup (JSON)</span>
            </button>

            <label className="btn btn-secondary" style={{ justifyContent: 'flex-start', cursor: 'pointer' }}>
              <Upload size={16} />
              <span>Restore from Backup (JSON)</span>
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleImport}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
