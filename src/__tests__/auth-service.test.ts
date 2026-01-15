import { AuthService } from '../main/services/auth-service';
import axios from 'axios';
import { BrowserWindow } from 'electron';
import Store from 'electron-store';

// Mock electron-store
jest.mock('electron-store');
const mockStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn()
};

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock BrowserWindow
jest.mock('electron', () => ({
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    webContents: {
      on: jest.fn()
    },
    on: jest.fn(),
    close: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false)
  }))
}));

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Mock electron-store constructor
    (Store as jest.Mock).mockImplementation(() => mockStore);

    authService = new AuthService();
  });

  describe('authenticateUser', () => {
    it('should complete full authentication flow and return AuthenticationData', async () => {
      // Mock Microsoft token response
      const microsoftToken = {
        access_token: 'microsoft_access_token',
        refresh_token: 'microsoft_refresh_token',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      // Mock Xbox Live auth response
      const xboxToken = {
        Token: 'xbox_token',
        DisplayClaims: {
          xui: [{ uhs: 'user_hash' }]
        }
      };

      // Mock XSTS token response
      const xstsToken = {
        Token: 'xsts_token',
        DisplayClaims: {
          xui: [{ uhs: 'user_hash' }]
        }
      };

      // Mock Minecraft auth response
      const minecraftToken = {
        access_token: 'minecraft_access_token',
        expires_in: 86400,
        token_type: 'Bearer'
      };

      // Mock Minecraft profile response
      const minecraftProfile = {
        id: 'player_id',
        name: 'PlayerName',
        skins: [{ id: 'skin_id', state: 'ACTIVE', url: 'https://example.com/skin.png', variant: 'classic' }]
      };

      // Mock axios responses in order
      mockedAxios.post.mockResolvedValueOnce({ data: microsoftToken }); // Exchange code for tokens
      mockedAxios.post.mockResolvedValueOnce({ data: xboxToken }); // Xbox Live auth
      mockedAxios.post.mockResolvedValueOnce({ data: xstsToken }); // XSTS token
      mockedAxios.post.mockResolvedValueOnce({ data: minecraftToken }); // Minecraft auth
      mockedAxios.get.mockResolvedValueOnce({ data: minecraftProfile }); // Minecraft profile

      // Mock BrowserWindow behavior for OAuth flow
      const mockWindow = {
        loadURL: jest.fn(),
        webContents: {
          on: jest.fn((event, callback) => {
            // Simulate navigation to redirect URI with code
            if (event === 'will-navigate') {
              setTimeout(() => {
                const mockEvent = { preventDefault: jest.fn() };
                callback(mockEvent, 'https://login.live.com/oauth20_desktop.srf?code=auth_code');
              }, 10);
            }
          })
        },
        on: jest.fn(),
        close: jest.fn(),
        isDestroyed: jest.fn().mockReturnValue(false)
      };

      (BrowserWindow as unknown as jest.Mock).mockReturnValue(mockWindow);

      const result = await authService.authenticateUser();

      expect(result).toEqual({
        accessToken: 'minecraft_access_token',
        refreshToken: 'microsoft_refresh_token',
        expiresAt: expect.any(Date),
        userProfile: {
          id: 'player_id',
          name: 'PlayerName',
          skinUrl: 'https://example.com/skin.png'
        }
      });

      // Verify storeAuthData was called
      expect(mockStore.set).toHaveBeenCalledWith('auth', expect.objectContaining({
        accessToken: 'minecraft_access_token'
      }));
    });

    it('should throw error when authentication fails', async () => {
      // Mock failed authentication
      mockedAxios.post.mockRejectedValue(new Error('Authentication failed'));

      await expect(authService.authenticateUser()).rejects.toThrow('Authentication failed');
    });
  });

  describe('getStoredAuthData', () => {
    it('should return stored authentication data', () => {
      const mockAuthData = {
        accessToken: 'test_token',
        refreshToken: 'test_refresh',
        expiresAt: new Date(Date.now() + 3600000),
        userProfile: { id: '123', name: 'TestUser' }
      };

      mockStore.get.mockReturnValue(mockAuthData);

      const result = authService.getStoredAuthData();

      expect(result).toEqual(mockAuthData);
      expect(mockStore.get).toHaveBeenCalledWith('auth');
    });

    it('should return null when no auth data is stored', () => {
      mockStore.get.mockReturnValue(null);

      const result = authService.getStoredAuthData();

      expect(result).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no auth data exists', () => {
      mockStore.get.mockReturnValue(null);

      const result = authService.isAuthenticated();

      expect(result).toBe(false);
    });

    it('should return true when token is valid', () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      const mockAuthData = {
        accessToken: 'test_token',
        refreshToken: 'test_refresh',
        expiresAt: futureDate,
        userProfile: { id: '123', name: 'TestUser' }
      };

      mockStore.get.mockReturnValue(mockAuthData);

      const result = authService.isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false when token is expired', () => {
      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      const mockAuthData = {
        accessToken: 'test_token',
        refreshToken: 'test_refresh',
        expiresAt: pastDate,
        userProfile: { id: '123', name: 'TestUser' }
      };

      mockStore.get.mockReturnValue(mockAuthData);

      const result = authService.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('refreshToken', () => {
    it('should refresh token and return updated AuthenticationData', async () => {
      const storedAuth = {
        accessToken: 'old_token',
        refreshToken: 'refresh_token',
        expiresAt: new Date(Date.now() - 3600000), // Expired
        userProfile: { id: '123', name: 'TestUser' }
      };

      mockStore.get.mockReturnValue(storedAuth);

      // Mock Microsoft refresh response
      const microsoftRefreshResponse = {
        access_token: 'new_microsoft_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      // Mock Xbox Live auth response
      const xboxToken = {
        Token: 'xbox_token',
        DisplayClaims: {
          xui: [{ uhs: 'user_hash' }]
        }
      };

      // Mock XSTS token response
      const xstsToken = {
        Token: 'xsts_token',
        DisplayClaims: {
          xui: [{ uhs: 'user_hash' }]
        }
      };

      // Mock Minecraft auth response
      const minecraftToken = {
        access_token: 'new_minecraft_token',
        expires_in: 86400,
        token_type: 'Bearer'
      };

      // Mock axios responses
      mockedAxios.post.mockResolvedValueOnce({ data: microsoftRefreshResponse }); // Refresh Microsoft token
      mockedAxios.post.mockResolvedValueOnce({ data: xboxToken }); // Xbox Live auth
      mockedAxios.post.mockResolvedValueOnce({ data: xstsToken }); // XSTS token
      mockedAxios.post.mockResolvedValueOnce({ data: minecraftToken }); // Minecraft auth

      const result = await authService.refreshToken();

      expect(result).toEqual({
        accessToken: 'new_minecraft_token',
        refreshToken: 'new_refresh_token',
        expiresAt: expect.any(Date),
        userProfile: storedAuth.userProfile
      });

      // Verify storeAuthData was called with updated data
      expect(mockStore.set).toHaveBeenCalledWith('auth', expect.objectContaining({
        accessToken: 'new_minecraft_token'
      }));
    });

    it('should throw error when no refresh token is available', async () => {
      mockStore.get.mockReturnValue(null);

      await expect(authService.refreshToken()).rejects.toThrow('No refresh token available');
    });

    it('should clear auth data when refresh fails', async () => {
      const storedAuth = {
        accessToken: 'old_token',
        refreshToken: 'refresh_token',
        expiresAt: new Date(Date.now() - 3600000),
        userProfile: { id: '123', name: 'TestUser' }
      };

      mockStore.get.mockReturnValue(storedAuth);

      // Mock failed refresh
      mockedAxios.post.mockRejectedValue(new Error('Refresh failed'));

      await expect(authService.refreshToken()).rejects.toThrow('Token refresh failed');

      // Verify clearAuthData was called
      expect(mockStore.delete).toHaveBeenCalledWith('auth');
    });
  });

  describe('validateSession', () => {
    it('should return null when no auth data exists', async () => {
      mockStore.get.mockReturnValue(null);

      const result = await authService.validateSession();

      expect(result).toBeNull();
    });

    it('should return stored auth data when session is valid', async () => {
      const futureDate = new Date(Date.now() + 3600000);
      const mockAuthData = {
        accessToken: 'valid_token',
        refreshToken: 'valid_refresh',
        expiresAt: futureDate,
        userProfile: { id: '123', name: 'TestUser' }
      };

      mockStore.get.mockReturnValue(mockAuthData);

      const result = await authService.validateSession();

      expect(result).toEqual(mockAuthData);
    });

    it('should refresh token and return new auth data when session is expired', async () => {
      const expiredAuth = {
        accessToken: 'expired_token',
        refreshToken: 'valid_refresh',
        expiresAt: new Date(Date.now() - 3600000),
        userProfile: { id: '123', name: 'TestUser' }
      };

      mockStore.get.mockReturnValue(expiredAuth);

      // Mock successful refresh
      const refreshedAuth = {
        accessToken: 'new_token',
        refreshToken: 'new_refresh',
        expiresAt: new Date(Date.now() + 86400000),
        userProfile: expiredAuth.userProfile
      };

      // Mock the refreshToken method
      jest.spyOn(authService, 'refreshToken').mockResolvedValue(refreshedAuth);

      const result = await authService.validateSession();

      expect(result).toEqual(refreshedAuth);
      expect(authService.refreshToken).toHaveBeenCalled();
    });

    it('should return null when refresh fails', async () => {
      const expiredAuth = {
        accessToken: 'expired_token',
        refreshToken: 'valid_refresh',
        expiresAt: new Date(Date.now() - 3600000),
        userProfile: { id: '123', name: 'TestUser' }
      };

      mockStore.get.mockReturnValue(expiredAuth);

      // Mock failed refresh
      jest.spyOn(authService, 'refreshToken').mockRejectedValue(new Error('Refresh failed'));

      const result = await authService.validateSession();

      expect(result).toBeNull();
    });
  });

  describe('validateMinecraftToken', () => {
    it('should return true for valid token', async () => {
      mockedAxios.get.mockResolvedValue({ status: 200 });

      const result = await authService.validateMinecraftToken('valid_token');

      expect(result).toBe(true);
    });

    it('should return false for invalid token', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Invalid token'));

      const result = await authService.validateMinecraftToken('invalid_token');

      expect(result).toBe(false);
    });
  });

  describe('logout', () => {
    it('should clear auth data and close auth window', async () => {
      // Mock auth window
      const mockWindow = {
        close: jest.fn(),
        isDestroyed: jest.fn().mockReturnValue(false)
      };

      (authService as any).authWindow = mockWindow;

      await authService.logout();

      expect(mockWindow.close).toHaveBeenCalled();
      expect(mockStore.delete).toHaveBeenCalledWith('auth');
    });

    it('should still clear auth data when window close fails', async () => {
      // Mock auth window that throws error on close
      const mockWindow = {
        close: jest.fn().mockImplementation(() => { throw new Error('Close failed'); }),
        isDestroyed: jest.fn().mockReturnValue(false)
      };

      (authService as any).authWindow = mockWindow;

      await authService.logout();

      expect(mockWindow.close).toHaveBeenCalled();
      expect(mockStore.delete).toHaveBeenCalledWith('auth');
    });
  });

  describe('getCurrentUser', () => {
    it('should return user profile when authenticated', () => {
      const mockAuthData = {
        accessToken: 'test_token',
        refreshToken: 'test_refresh',
        expiresAt: new Date(Date.now() + 3600000),
        userProfile: { id: '123', name: 'TestUser', skinUrl: 'https://example.com/skin.png' }
      };

      mockStore.get.mockReturnValue(mockAuthData);

      const result = authService.getCurrentUser();

      expect(result).toEqual({
        id: '123',
        name: 'TestUser',
        skinUrl: 'https://example.com/skin.png'
      });
    });

    it('should return null when not authenticated', () => {
      mockStore.get.mockReturnValue(null);

      const result = authService.getCurrentUser();

      expect(result).toBeNull();
    });
  });

  describe('checkMinecraftOwnership', () => {
    it('should return true when user owns Minecraft', async () => {
      const mockAuthData = {
        accessToken: 'valid_token',
        refreshToken: 'test_refresh',
        expiresAt: new Date(Date.now() + 3600000),
        userProfile: { id: '123', name: 'TestUser' }
      };

      mockStore.get.mockReturnValue(mockAuthData);
      mockedAxios.get.mockResolvedValue({ status: 200 });

      const result = await authService.checkMinecraftOwnership();

      expect(result).toBe(true);
    });

    it('should return false when user does not own Minecraft', async () => {
      const mockAuthData = {
        accessToken: 'invalid_token',
        refreshToken: 'test_refresh',
        expiresAt: new Date(Date.now() + 3600000),
        userProfile: { id: '123', name: 'TestUser' }
      };

      mockStore.get.mockReturnValue(mockAuthData);
      mockedAxios.get.mockRejectedValue(new Error('Not found'));

      const result = await authService.checkMinecraftOwnership();

      expect(result).toBe(false);
    });

    it('should return false when not authenticated', async () => {
      mockStore.get.mockReturnValue(null);

      const result = await authService.checkMinecraftOwnership();

      expect(result).toBe(false);
    });
  });
});
