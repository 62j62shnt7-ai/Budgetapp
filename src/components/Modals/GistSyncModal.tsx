import React, { useState, useEffect } from 'react';
import { useBudgetStore } from '../../store/useBudgetStore';

interface GistSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GistSyncModal: React.FC<GistSyncModalProps> = ({ isOpen, onClose }) => {
  const {
    gistToken,
    gistId,
    gistAutoSync,
    setGistConfig,
    syncFromGist,
    exportJSON,
    importJSON,
  } = useBudgetStore();

  const [tokenInput, setTokenInput] = useState('');
  const [idInput, setIdInput] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [gistDetails, setGistDetails] = useState<{
    tone: 'muted' | 'success' | 'error';
    message?: string;
    fileName?: string;
    fileSizeKb?: string;
    exportDate?: string;
    cashEntries?: number;
    installments?: number;
    storageAssets?: number;
  } | null>(null);

  useEffect(() => {
    setTokenInput(gistToken);
    setIdInput(gistId);
    setAutoSync(gistAutoSync);
  }, [gistToken, gistId, gistAutoSync, isOpen]);

  if (!isOpen) return null;

  const showMsg = (text: string, isError = false) => {
    setStatusMessage({ text, isError });
  };

  const handleAutoSyncChange = (enabled: boolean) => {
    setAutoSync(enabled);
    setGistConfig(tokenInput.trim() || gistToken, idInput.trim() || gistId, enabled);
  };

  // Find user's existing budget gist
  const handleFindGist = async () => {
    const token = tokenInput.trim();
    if (!token) return showMsg('Please enter a GitHub Token first', true);

    setIsLoading(true);
    try {
      const res = await fetch('https://api.github.com/gists', {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (!res.ok) throw new Error(`GitHub error: ${res.statusText}`);
      const gists = await res.json();
      const match = gists.find((g: any) => g.files && (
        g.files['budget-data.json'] ||
        g.files['budget-control-backup.json'] ||
        g.description?.includes('Budget Control')
      ));
      if (match) {
        setIdInput(match.id);
        setGistConfig(token, match.id, autoSync);
        showMsg(`Found Gist: ${match.id}. Downloading latest data...`);
        const restored = await syncFromGist(token, match.id);
        if (restored) {
          showMsg(`Found Gist: ${match.id}. Latest data restored.`);
        } else {
          showMsg('Gist found, but the latest data could not be restored.', true);
        }
      } else {
        showMsg('No existing budget gist found. You can click "Auto-Create Gist" below.', true);
      }
    } catch (err: any) {
      showMsg(`Failed to search: ${err.message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  // Create new Gist
  const handleCreateGist = async () => {
    const token = tokenInput.trim();
    if (!token) return showMsg('Please enter a GitHub Token first', true);

    setIsLoading(true);
    try {
      const payload = exportJSON();
      const res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Budget Control Backup',
          public: false,
          files: {
            'budget-data.json': {
              content: payload,
            },
          },
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.statusText}`);
      const data = await res.json();
      setIdInput(data.id);
      setGistConfig(token, data.id, autoSync);
      showMsg(`Successfully created secret Gist: ${data.id}`);
    } catch (err: any) {
      showMsg(`Error creating gist: ${err.message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  // Upload local data to Gist
  const handleUpload = async () => {
    const token = tokenInput.trim() || gistToken;
    const gId = idInput.trim() || gistId;
    if (!token || !gId) return showMsg('Token and Gist ID are required to upload', true);
    if (!window.confirm('This will replace the budget data stored in the GitHub Gist with this browser\'s current data. Continue?')) {
      return;
    }

    setIsLoading(true);
    try {
      const current = await fetch(`https://api.github.com/gists/${gId}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (!current.ok) throw new Error(`Unable to verify Gist: ${current.statusText}`);
      const payload = exportJSON();
      const res = await fetch(`https://api.github.com/gists/${gId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Budget Control Backup',
          files: {
            'budget-data.json': {
              content: payload,
            },
          },
        }),
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
      setGistConfig(token, gId, autoSync);
      showMsg('✓ Successfully uploaded local data to Cloud Gist!');
    } catch (err: any) {
      showMsg(`Upload error: ${err.message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInspect = async () => {
    const token = tokenInput.trim() || gistToken;
    const gId = idInput.trim() || gistId;
    if (!token || !gId) {
      setGistDetails({ tone: 'error', message: 'Please enter both a Personal Access Token and Gist ID above first.' });
      return showMsg('Token and Gist ID are required to inspect', true);
    }

    setIsLoading(true);
    setGistDetails({ tone: 'muted', message: 'Fetching Gist status from GitHub...' });
    try {
      const res = await fetch(`https://api.github.com/gists/${gId}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (!res.ok) throw new Error(`Inspection failed: ${res.statusText}`);
      const data = await res.json();
      const file = data.files?.['budget-data.json'] || data.files?.['budget-control-backup.json'] || Object.values(data.files || {})[0];
      if (!file?.content) {
        setGistDetails({ tone: 'error', message: 'Gist found, but contains no valid budget JSON file.' });
        return;
      }
      const payload = JSON.parse(file.content);
      const source = payload?.data || payload;
      if (!source || typeof source !== 'object') {
        setGistDetails({ tone: 'error', message: 'Gist JSON structure does not match Budget Control format.' });
        return;
      }
      const cashEntries = source.cashEntries || source.entries;
      setGistDetails({
        tone: 'success',
        fileName: file.filename || 'budget-data.json',
        fileSizeKb: `${(Number(file.size || file.content.length) / 1024).toFixed(1)} KB`,
        exportDate: payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : 'Unknown date',
        cashEntries: Array.isArray(cashEntries) ? cashEntries.length : 0,
        installments: Array.isArray(source.installments) ? source.installments.length : 0,
        storageAssets: Array.isArray(source.storageAssets) ? source.storageAssets.length : 0,
      });
      showMsg('Gist inspected successfully.');
    } catch (err) {
      setGistDetails({
        tone: 'error',
        message: `Error connecting to Gist: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
      showMsg(`Inspection error: ${err instanceof Error ? err.message : 'Unknown error'}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  // Download data from Gist
  const handleDownload = async () => {
    const token = tokenInput.trim() || gistToken;
    const gId = idInput.trim() || gistId;
    if (!gId) return showMsg('Gist ID is required to download', true);

    setIsLoading(true);
    try {
      const headers: any = { Accept: 'application/vnd.github.v3+json' };
      if (token) headers.Authorization = `token ${token}`;

      const res = await fetch(`https://api.github.com/gists/${gId}`, { headers });
      if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
      const data = await res.json();
      const file = data.files && (
        data.files['budget-data.json'] ||
        data.files['budget-control-backup.json'] ||
        Object.values(data.files)[0]
      );
      if (!file || !file.content) throw new Error('No valid budget file content found in this Gist');

      const success = importJSON(file.content);
      if (success) {
        setGistConfig(token, gId, autoSync);
        showMsg('✓ Successfully downloaded and restored cloud budget data!');
      } else {
        showMsg('Failed to parse cloud data payload', true);
      }
    } catch (err: any) {
      showMsg(`Download error: ${err.message}`, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    setGistConfig('', '', false);
    setTokenInput('');
    setIdInput('');
    setAutoSync(false);
    showMsg('Disconnected from Gist cloud sync.');
  };

  const handleCopySyncLink = () => {
    const url = new URL(window.location.href);
    if (idInput) {
      url.searchParams.set('gist', idInput);
    }
    navigator.clipboard.writeText(url.toString());
    showMsg('Copied sync link to clipboard!');
  };

  return (
    <dialog open className="native-dialog gist-sync-dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ display: 'block', zIndex: 1000 }}>
      <div className="dialog-heading">
        <h3>☁️ GitHub Gist Cloud Sync</h3>
        <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
          x
        </button>
      </div>

      <p className="gist-sync-intro">
        Sync your budget across devices with a private GitHub Gist.
        <strong>💡 New device?</strong> Enter your Token and Gist ID once to connect.
      </p>

      <div className="gist-sync-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <section className="gist-sync-section" aria-labelledby="gist-connection-heading">
          <div className="gist-sync-section-heading">
            <h4 id="gist-connection-heading">Connection</h4>
            <span>{gistId ? 'Connected' : 'Not connected'}</span>
          </div>
          <label>
            GitHub Personal Access Token (PAT)
          <div className="gist-token-row" style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxx or github_pat_xxxx"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="ghost-button"
              type="button"
              onClick={handleFindGist}
              disabled={isLoading}
              style={{ whiteSpace: 'nowrap' }}
            >
              🔍 Find My Gist
            </button>
          </div>
          <small style={{ color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
            Need a token? Go to GitHub Settings &rarr; Developer Settings &rarr; Personal access tokens (check 'gist' scope).
          </small>
          </label>

          <label>
            Gist ID
            <input
              type="text"
              placeholder="Auto-filled when clicking 'Find My Gist'..."
              value={idInput}
              onChange={(e) => setIdInput(e.target.value)}
            />
          </label>
        </section>

        <section className="gist-sync-section gist-sync-preferences" aria-labelledby="gist-preferences-heading">
          <div className="gist-sync-section-heading">
            <h4 id="gist-preferences-heading">Automatic sync</h4>
            <span>{autoSync ? 'Enabled' : 'Manual only'}</span>
          </div>
          <label className="gist-sync-checkbox">
            <input type="checkbox" checked={autoSync} onChange={(e) => handleAutoSyncChange(e.target.checked)} />
            <span>Sync changes to the cloud automatically in the background.</span>
          </label>
        </section>

        {statusMessage && (
          <div className={`gist-sync-message ${statusMessage.isError ? 'is-error' : ''}`} role="status" aria-live="polite">
            <span>{statusMessage.text}</span>
            <button type="button" aria-label="Dismiss sync message" onClick={() => setStatusMessage(null)}>×</button>
          </div>
        )}

        {gistDetails && (
          <div className={`gist-cloud-status gist-cloud-status-${gistDetails.tone}`} role="status" aria-live="polite">
            <div className="gist-sync-section-heading">
              <h4>Last cloud data</h4>
              {gistDetails.tone === 'success' && <span>Available</span>}
            </div>
            {gistDetails.message ? (
              <p>{gistDetails.message}</p>
            ) : (
              <ul>
                <li><strong>File:</strong> {gistDetails.fileName} ({gistDetails.fileSizeKb})</li>
                <li><strong>Exported:</strong> {gistDetails.exportDate}</li>
                <li><strong>Contents:</strong> {gistDetails.cashEntries} entries · {gistDetails.installments} installments · {gistDetails.storageAssets} assets</li>
              </ul>
            )}
          </div>
        )}

        <section className="gist-sync-section gist-sync-transfer" aria-labelledby="gist-transfer-heading">
          <div className="gist-sync-section-heading">
            <h4 id="gist-transfer-heading">Cloud data</h4>
            <span>Manual actions</span>
          </div>
          <div className="dialog-actions gist-sync-actions" style={{ flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', marginTop: '12px' }}>
          <div className="gist-sync-action-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="ghost-button" type="button" onClick={handleCreateGist} disabled={isLoading}>
              Auto-Create Gist
            </button>
            <button className="ghost-button" type="button" onClick={handleCopySyncLink}>
              🔗 Copy Sync Link
            </button>
            <button className="ghost-button" type="button" onClick={handleInspect} disabled={isLoading}>
              🔍 Check Cloud Data
            </button>
            {gistId && (
              <button className="ghost-button" type="button" onClick={handleDisconnect} style={{ color: 'var(--red)' }}>
                Disconnect
              </button>
            )}
          </div>
          <div className="gist-sync-action-group gist-sync-data-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="ghost-button" type="button" onClick={handleDownload} disabled={isLoading}>
              ⬇️ Download Cloud Data
            </button>
            <button className="primary-button" type="button" onClick={handleUpload} disabled={isLoading}>
              ⬆️ Upload Local Data
            </button>
          </div>
          </div>
        </section>
      </div>
    </dialog>
  );
};
