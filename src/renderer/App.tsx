import { useEffect, useState } from 'react';
import { VersionSelector } from './components/VersionSelector';
import { ProfileManager } from './components/ProfileManager';
import { LauncherInterface } from './components/LauncherInterface';
import { ToastContainer } from './components/ToastContainer';
import { JavaExtractionProgress } from './components/JavaExtractionProgress';
import { useToast } from './hooks/useToast';

interface AuthUserProfile {
  id: string;
  name: string;
  skinUrl?: string;
}

interface UserProfile {
  id: number;
  name: string;
  versionId: string;
  installationDir: string;
  memoryMin: number;
  memoryMax: number;
  jvmArgs: string;
  modLoader?: {
    type: 'forge' | 'fabric' | 'quilt';
    version: string;
  };
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userProfile, setUserProfile] = useState<AuthUserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'launcher' | 'versions' | 'profiles'>('launcher');
  const { toasts, removeToast, success, error: showError, info } = useToast();

  useEffect(() => {
    // Test IPC communication and check authentication status
    const loadAppInfo = async () => {
      try {
        // Check authentication status
        const authenticated = await window.electronAPI.isAuthenticated();
        setIsAuthenticated(authenticated);

        if (authenticated) {
          const currentUser = await window.electronAPI.getCurrentUser();
          setUserProfile(currentUser);
        }
      } catch (error) {
        console.error('Failed to load app info:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAppInfo();
  }, []);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setAuthError(null);

      await window.electronAPI.authenticateUser();

      // Check authentication status after login
      const authenticated = await window.electronAPI.isAuthenticated();
      setIsAuthenticated(authenticated);

      if (authenticated) {
        const currentUser = await window.electronAPI.getCurrentUser();
        setUserProfile(currentUser);
        success('Successfully logged in!');
      }
    } catch (error) {
      console.error('Login failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setAuthError(errorMessage);
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      setAuthError(null);

      await window.electronAPI.logout();
      setIsAuthenticated(false);
      setUserProfile(null);
      info('Successfully logged out');
    } catch (error) {
      console.error('Logout failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Logout failed';
      setAuthError(errorMessage);
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMinimize = () => {
    window.electronAPI.minimizeWindow();
  };

  const handleMaximize = () => {
    window.electronAPI.maximizeWindow();
  };

  const handleClose = () => {
    window.electronAPI.closeWindow();
  };

  return (
    <div className="app">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <JavaExtractionProgress />
      <header className="app-header">
        <div className="title-bar">
          <h1>Minecraft Launcher</h1>
          <div className="window-controls">
            <button onClick={handleMinimize} className="window-btn minimize">
              −
            </button>
            <button onClick={handleMaximize} className="window-btn maximize">
              □
            </button>
            <button onClick={handleClose} className="window-btn close">
              ×
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {isLoading ? (
          <div className="loading-section">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        ) : (
          <>
            {isAuthenticated && userProfile ? (
              <div className="authenticated-section">
                <div className="user-profile-bar">
                  <div className="user-profile-compact">
                    <div className="user-avatar-small">
                      {userProfile.skinUrl ? (
                        <img
                          src={userProfile.skinUrl}
                          alt={`${userProfile.name}'s avatar`}
                          className="avatar-image"
                        />
                      ) : (
                        <div className="default-avatar-small">
                          {userProfile.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="user-name">{userProfile.name}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="logout-btn-compact"
                    disabled={isLoading}
                  >
                    Logout
                  </button>
                </div>

                <div className="launcher-tabs">
                  <button
                    className={`tab-btn ${activeTab === 'launcher' ? 'active' : ''}`}
                    onClick={() => setActiveTab('launcher')}
                  >
                    🎮 Launcher
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'profiles' ? 'active' : ''}`}
                    onClick={() => setActiveTab('profiles')}
                  >
                    👤 Profiles
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'versions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('versions')}
                  >
                    📦 Versions
                  </button>
                </div>

                <div className="launcher-content-area">
                  {activeTab === 'launcher' && (
                    <LauncherInterface
                      selectedProfile={selectedProfile}
                      onProfileChange={() => {}}
                    />
                  )}
                  {activeTab === 'profiles' && (
                    <ProfileManager
                      onProfileSelect={(profile) => setSelectedProfile(profile)}
                    />
                  )}
                  {activeTab === 'versions' && (
                    <VersionSelector />
                  )}
                </div>
              </div>
            ) : (
              <div className="authentication-section">
                <div className="login-card">
                  <h2>Login to Minecraft</h2>
                  <p>Sign in with your Microsoft account to access Minecraft</p>

                  <button
                    onClick={handleLogin}
                    className="microsoft-login-btn"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span className="loading-spinner"></span> Signing in...
                      </>
                    ) : (
                      <>
                        <span className="microsoft-logo">🪟</span> Sign in with Microsoft
                      </>
                    )}
                  </button>

                  {authError && (
                    <div className="auth-error">
                      <p>❌ {authError}</p>
                      <button
                        onClick={() => setAuthError(null)}
                        className="dismiss-error-btn"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  <div className="auth-info">
                    <p>✅ Secure Microsoft authentication</p>
                    <p>✅ Token encryption and storage</p>
                    <p>✅ Automatic token refresh</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
