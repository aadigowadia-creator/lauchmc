import { useEffect, useState } from 'react';
import './JavaExtractionProgress.css';

interface ExtractionState {
  isExtracting: boolean;
  currentVersion: number | null;
  progress: number;
  completedVersions: number[];
  error: string | null;
}

export function JavaExtractionProgress() {
  const [extractionState, setExtractionState] = useState<ExtractionState>({
    isExtracting: false,
    currentVersion: null,
    progress: 0,
    completedVersions: [],
    error: null,
  });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Listen for extraction events
    window.electronAPI.onJavaExtractionStart((data) => {
      setExtractionState((prev) => ({
        ...prev,
        isExtracting: true,
        currentVersion: data.version,
        progress: 0,
        error: null,
      }));
    });

    window.electronAPI.onJavaExtractionProgress((data) => {
      setExtractionState((prev) => ({
        ...prev,
        progress: data.progress,
      }));
    });

    window.electronAPI.onJavaExtractionComplete((data) => {
      setExtractionState((prev) => ({
        ...prev,
        completedVersions: [...prev.completedVersions, data.version],
        currentVersion: null,
        progress: 0,
      }));
    });

    window.electronAPI.onJavaExtractionError((data) => {
      setExtractionState((prev) => ({
        ...prev,
        isExtracting: false,
        currentVersion: null,
        error: `Failed to extract Java ${data.version}: ${data.error}`,
      }));
    });

    window.electronAPI.onJavaInitializationComplete((data) => {
      setIsInitialized(true);
      setExtractionState((prev) => ({
        ...prev,
        isExtracting: false,
        currentVersion: null,
      }));

      if (!data.success && data.error) {
        setExtractionState((prev) => ({
          ...prev,
          error: `Java initialization failed: ${data.error}`,
        }));
      }
    });

    // Cleanup listeners on unmount
    return () => {
      window.electronAPI.removeAllJavaListeners();
    };
  }, []);

  // Don't show anything if not extracting and no error
  if (!extractionState.isExtracting && !extractionState.error && isInitialized) {
    return null;
  }

  // Don't show anything initially until we know if extraction is needed
  if (!extractionState.isExtracting && !extractionState.error && !isInitialized) {
    return null;
  }

  return (
    <div className="java-extraction-overlay">
      <div className="java-extraction-modal">
        <div className="java-extraction-header">
          <h2>Setting up Java Runtime</h2>
          <p className="java-extraction-subtitle">
            First launch setup - this will only happen once
          </p>
        </div>

        <div className="java-extraction-content">
          {extractionState.error ? (
            <div className="java-extraction-error">
              <div className="error-icon">⚠️</div>
              <p className="error-message">{extractionState.error}</p>
              <p className="error-fallback">
                The launcher will attempt to use your system Java installation.
              </p>
              <button
                className="error-dismiss-btn"
                onClick={() => setExtractionState((prev) => ({ ...prev, error: null }))}
              >
                Continue
              </button>
            </div>
          ) : extractionState.isExtracting && extractionState.currentVersion ? (
            <div className="java-extraction-progress">
              <div className="extraction-status">
                <div className="extraction-icon">☕</div>
                <p className="extraction-text">
                  Extracting Java {extractionState.currentVersion} runtime...
                </p>
              </div>

              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${extractionState.progress}%` }}
                />
              </div>

              <p className="progress-percentage">{extractionState.progress}%</p>

              {extractionState.completedVersions.length > 0 && (
                <div className="completed-versions">
                  <p className="completed-text">
                    ✓ Completed: Java {extractionState.completedVersions.join(', Java ')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="java-extraction-progress">
              <div className="extraction-status">
                <div className="loading-spinner"></div>
                <p className="extraction-text">Initializing Java runtimes...</p>
              </div>
            </div>
          )}
        </div>

        <div className="java-extraction-footer">
          <p className="extraction-info">
            The launcher includes Java 8 and Java 17 for the best Minecraft experience.
          </p>
        </div>
      </div>
    </div>
  );
}
