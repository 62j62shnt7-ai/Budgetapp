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
    exportJSON,
    importJSON,
  } = useBudgetStore();

  const [tokenInput, setTokenInput] = useState('');
  const [idInput, setIdInput] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setTokenInput(gistToken);
    setIdInput(gistId);
    setAutoSync(gistAutoSync);
  }, [gistToken, gistId, gistAutoSync, isOpen]);

  if (!isOpen) return null;

  const showMsg = (text: string, isError = false) => {
    setStatusMessage({ text, isError });
    setTimeout(() => setStatusMessage(null), 6000);
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
      const match = gists.find((g: any) => g.files && (g.files['budget-control-backup.json'] || g.description?.includes('Budget Control')));
      if (match) {
        setIdInput(match.id);
        setGistConfig(token, match.id, autoSync);
        showMsg(`Found Gist: ${match.id}`);
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
            'budget-control-backup.json': {
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

    setIsLoading(true);
    try {
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
            'budget-control-backup.json': {
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
      const file = data.files && (data.files['budget-control-backup.json'] || Object.values(data.files)[0]);
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
    <dialog open className="native-dialog" style={{ display: 'block', zIndex: 1000 }}>
      <div className="dialog-heading">
        <h3>☁️ GitHub Gist Cloud Sync</h3>
        <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
          x
        </button>
      </div>

      <p style={{ margin: '8px 0 16px', color: 'var(--muted)', fontSize: '13px', lineHeight: '1.5' }}>
        Sync your budget data across all your devices using a private GitHub Gist.
        <strong style={{ display: 'block', marginTop: '4px', color: 'var(--ink)' }}>
          💡 On a new device/browser?
        </strong>{' '}
        Enter your Token &amp; Gist ID once (or use a Sync Link) to connect.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <label>
          GitHub Personal Access Token (PAT)
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
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

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'normal', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
          />
          <span>Auto-sync changes to cloud in background</span>
        </label>

        {statusMessage && (
          <div
            style={{
              padding: '10px',
              borderRadius: '6px',
              fontSize: '13px',
              background: statusMessage.isError ? 'rgba(192, 61, 53, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              color: statusMessage.isError ? 'var(--red)' : 'var(--green)',
            }}
          >
            {statusMessage.text}
          </div>
        )}

        <div className="dialog-actions" style={{ flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', marginTop: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="ghost-button" type="button" onClick={handleCreateGist} disabled={isLoading}>
              Auto-Create Gist
            </button>
            <button className="ghost-button" type="button" onClick={handleCopySyncLink}>
              🔗 Copy Sync Link
            </button>
            {gistId && (
              <button className="ghost-button" type="button" onClick={handleDisconnect} style={{ color: 'var(--red)' }}>
                Disconnect
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="ghost-button" type="button" onClick={handleDownload} disabled={isLoading}>
              ⬇️ Download Cloud Data
            </button>
            <button className="primary-button" type="button" onClick={handleUpload} disabled={isLoading}>
              ⬆️ Upload Local Data
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};
