import React, { useEffect, useState } from 'react';

interface GameVersion {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  time: string;
  releaseTime: string;
  sha1: string;
  complianceLevel: number;
}

interface DownloadProgress {
  versionId: string;
  stage: string;
  percentage: number;
  downloadedBytes?: number;
  totalBytes?: number;
  currentFile?: string;
}

interface VersionSelectorProps {
  onVersionSelect?: (version: GameVersion) => void;
}

export const VersionSelector: React.FC<VersionSelectorProps> = ({ onVersionSelect }) => {
  const [versions, setVersions] = useState<GameVersion[]>([]);
  const [installedVersions, setInstalledVersions] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'release' | 'snapshot'>('release');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(new Map());
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  useEffect(() => {
    loadVersions();
    loadInstalledVersions();

    // Listen for download progress
    window.electronAPI.onVersionDownloadProgress((progress: DownloadProgress) => {
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        newMap.set(progress.versionId, progress);
        return newMap;
      });
    });

    return () => {
      window.electronAPI.removeAllVersionListeners();
    };
  }, []);

  useEffect(() => {
    loadVersions();
  }, [filter]);

  const loadVersions = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let fetchedVersions: GameVersion[];
      if (filter === 'release') {
        fetchedVersions = await window.electronAPI.getReleaseVersions();
      } else if (filter === 'snapshot') {
        fetchedVersions = await window.electronAPI.getSnapshotVersions();
      } else {
        fetchedVersions = await window.electronAPI.getVersions();
      }

      setVersions(fetchedVersions);
    } catch (err) {
      console.error('Failed to load versions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load versions');
    } finally {
      setIsLoading(false);
    }
  };

  const loadInstalledVersions = async () => {
    try {
      const installed = await window.electronAPI.getInstalledVersions();
      setInstalledVersions(installed);
    } catch (err) {
      console.error('Failed to load installed versions:', err);
    }
  };

  const handleDownloadVersion = async (versionId: string) => {
    try {
      setError(null);
      await window.electronAPI.downloadVersion(versionId);
      await loadInstalledVersions();
      
      // Clear progress after successful download
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(versionId);
        return newMap;
      });
    } catch (err) {
      console.error('Failed to download version:', err);
      setError(err instanceof Error ? err.message : 'Failed to download version');
      
      // Clear progress on error
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(versionId);
        return newMap;
      });
    }
  };

  const handleCancelDownload = async (versionId: string) => {
    try {
      await window.electronAPI.cancelVersionDownload(versionId);
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(versionId);
        return newMap;
      });
    } catch (err) {
      console.error('Failed to cancel download:', err);
    }
  };

  const handleVersionClick = (version: GameVersion) => {
    setSelectedVersion(version.id);
    onVersionSelect?.(version);
  };

  const isVersionInstalled = (versionId: string) => {
    return installedVersions.includes(versionId);
  };

  const getVersionProgress = (versionId: string) => {
    return downloadProgress.get(versionId);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="version-selector">
      <div className="version-selector-header">
        <h3>Minecraft Versions</h3>
        <div className="version-filter">
          <button
            className={`filter-btn ${filter === 'release' ? 'active' : ''}`}
            onClick={() => setFilter('release')}
          >
            Releases
          </button>
          <button
            className={`filter-btn ${filter === 'snapshot' ? 'active' : ''}`}
            onClick={() => setFilter('snapshot')}
          >
            Snapshots
          </button>
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
        </div>
      </div>

      {error && (
        <div className="version-error">
          <p>❌ {error}</p>
          <button onClick={() => setError(null)} className="dismiss-btn">
            Dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="version-loading">
          <div className="loading-spinner"></div>
          <p>Loading versions...</p>
        </div>
      ) : (
        <div className="version-list">
          {versions.length === 0 ? (
            <div className="no-versions">
              <p>No versions found</p>
            </div>
          ) : (
            versions.map(version => {
              const installed = isVersionInstalled(version.id);
              const progress = getVersionProgress(version.id);
              const isDownloading = !!progress;

              return (
                <div
                  key={version.id}
                  className={`version-item ${selectedVersion === version.id ? 'selected' : ''} ${installed ? 'installed' : ''}`}
                  onClick={() => !isDownloading && handleVersionClick(version)}
                >
                  <div className="version-info">
                    <div className="version-name">
                      <span className="version-id">{version.id}</span>
                      <span className={`version-type ${version.type}`}>
                        {version.type}
                      </span>
                    </div>
                    <div className="version-date">
                      {new Date(version.releaseTime).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="version-actions">
                    {installed ? (
                      <span className="installed-badge">✓ Installed</span>
                    ) : isDownloading && progress ? (
                      <div className="download-progress-container">
                        <div className="progress-info">
                          <span className="progress-stage">{progress.stage}</span>
                          <span className="progress-percentage">{progress.percentage}%</span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${progress.percentage}%` }}
                          ></div>
                        </div>
                        {progress.downloadedBytes && progress.totalBytes && (
                          <div className="progress-bytes">
                            {formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)}
                          </div>
                        )}
                        <button
                          className="cancel-download-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelDownload(version.id);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="download-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadVersion(version.id);
                        }}
                      >
                        Download
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
