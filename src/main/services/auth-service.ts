import { BrowserWindow } from 'electron';
import axios from 'axios';
import Store from 'electron-store';
import { AuthenticationData } from '../models';

// Microsoft OAuth configuration
const MICROSOFT_CLIENT_ID = '00000000402b5328'; // Minecraft's client ID
const MICROSOFT_REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const MICROSOFT_SCOPE = 'XboxLive.signin offline_access';

// Xbox Live and Minecraft API endpoints
const XBOX_LIVE_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XBOX_LIVE_XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MINECRAFT_AUTH_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const MINECRAFT_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface XboxLiveAuthResponse {
  Token: string;
  DisplayClaims: {
    xui: Array<{ uhs: string }>;
  };
}

interface MinecraftAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface MinecraftProfile {
  id: string;
  name: string;
  skins?: Array<{
    id: string;
    state: string;
    url: string;
    variant: string;
  }>;
}

export class AuthService {
  private store: Store<{ auth?: AuthenticationData }>;
  private authWindow: BrowserWindow | null = null;

  constructor() {
    // Initialize encrypted store for secure token storage
    this.store = new Store({
      name: 'auth-data',
      encryptionKey: 'minecraft-launcher-auth-key',
      defaults: {}
    });
  }

  /**
   * Initiates Microsoft OAuth authentication flow
   * Requirements: 1.1 - Redirect to Microsoft authentication when user clicks login
   */
  async authenticateUser(): Promise<AuthenticationData> {
    try {
      // Step 1: Get Microsoft OAuth token
      const microsoftToken = await this.getMicrosoftToken();
      
      // Step 2: Authenticate with Xbox Live
      const xboxToken = await this.authenticateWithXboxLive(microsoftToken.access_token);
      
      // Step 3: Get Xbox Live Security Token Service (XSTS) token
      const xstsToken = await this.getXSTSToken(xboxToken.Token);
      
      // Step 4: Authenticate with Minecraft
      const minecraftToken = await this.authenticateWithMinecraft(
        xstsToken.DisplayClaims.xui[0].uhs,
        xstsToken.Token
      );
      
      // Step 5: Get Minecraft profile
      const profile = await this.getMinecraftProfile(minecraftToken.access_token);
      
      // Step 6: Create authentication data
      const authData: AuthenticationData = {
        accessToken: minecraftToken.access_token,
        refreshToken: microsoftToken.refresh_token,
        expiresAt: new Date(Date.now() + minecraftToken.expires_in * 1000),
        userProfile: {
          id: profile.id,
          name: profile.name,
          skinUrl: profile.skins?.[0]?.url
        }
      };

      // Step 7: Store authentication data securely
      await this.storeAuthData(authData);
      
      return authData;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets Microsoft OAuth token through browser-based authentication
   */
  private async getMicrosoftToken(): Promise<MicrosoftTokenResponse> {
    return new Promise((resolve, reject) => {
      const authUrl = `https://login.live.com/oauth20_authorize.srf?` +
        `client_id=${MICROSOFT_CLIENT_ID}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(MICROSOFT_REDIRECT_URI)}&` +
        `scope=${encodeURIComponent(MICROSOFT_SCOPE)}&` +
        `response_mode=query`;

      // Create authentication window
      this.authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      this.authWindow.loadURL(authUrl);

      let handled = false;

      const handleCallback = async (url: string) => {
        if (handled) return;
        
        if (url.includes('code=') || url.includes('error=')) {
          handled = true;
          try {
            const urlObj = new URL(url);
            const code = urlObj.searchParams.get('code');
            const error = urlObj.searchParams.get('error');

            if (error) {
              throw new Error(`OAuth error: ${error}`);
            }

            if (!code) {
              throw new Error('No authorization code received');
            }

            // Exchange code for tokens
            const tokenResponse = await this.exchangeCodeForTokens(code);
            this.authWindow?.close();
            resolve(tokenResponse);
          } catch (err) {
            this.authWindow?.close();
            reject(err);
          }
        }
      };

      // Handle navigation to capture authorization code
      this.authWindow.webContents.on('will-navigate', async (_event, navigationUrl) => {
        if (navigationUrl.includes('code=') || navigationUrl.includes('error=')) {
          _event.preventDefault();
          await handleCallback(navigationUrl);
        }
      });

      // Also handle redirects
      this.authWindow.webContents.on('will-redirect', async (_event, navigationUrl) => {
        if (navigationUrl.includes('code=') || navigationUrl.includes('error=')) {
          _event.preventDefault();
          await handleCallback(navigationUrl);
        }
      });

      // Check URL changes
      this.authWindow.webContents.on('did-navigate', async (_event, navigationUrl) => {
        await handleCallback(navigationUrl);
      });

      // Handle window closed without authentication
      this.authWindow.on('closed', () => {
        this.authWindow = null;
        if (!handled) {
          reject(new Error('Authentication window was closed'));
        }
      });
    });
  }

  /**
   * Exchanges authorization code for access and refresh tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<MicrosoftTokenResponse> {
    const response = await axios.post('https://login.live.com/oauth20_token.srf', 
      new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: MICROSOFT_REDIRECT_URI,
        scope: MICROSOFT_SCOPE
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data;
  }

  /**
   * Authenticates with Xbox Live using Microsoft token
   */
  private async authenticateWithXboxLive(accessToken: string): Promise<XboxLiveAuthResponse> {
    const response = await axios.post(XBOX_LIVE_AUTH_URL, {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${accessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  /**
   * Gets Xbox Live Security Token Service (XSTS) token
   */
  private async getXSTSToken(xboxToken: string): Promise<XboxLiveAuthResponse> {
    const response = await axios.post(XBOX_LIVE_XSTS_URL, {
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xboxToken]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  /**
   * Authenticates with Minecraft services using Xbox tokens
   */
  private async authenticateWithMinecraft(userHash: string, xstsToken: string): Promise<MinecraftAuthResponse> {
    const response = await axios.post(MINECRAFT_AUTH_URL, {
      identityToken: `XBL3.0 x=${userHash};${xstsToken}`
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  /**
   * Gets Minecraft profile information
   */
  private async getMinecraftProfile(accessToken: string): Promise<MinecraftProfile> {
    const response = await axios.get(MINECRAFT_PROFILE_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    return response.data;
  }

  /**
   * Stores authentication data securely using electron-store encryption
   * Requirements: 1.2 - Store authentication tokens securely after successful login
   */
  private async storeAuthData(authData: AuthenticationData): Promise<void> {
    this.store.set('auth', authData);
  }

  /**
   * Retrieves stored authentication data
   */
  getStoredAuthData(): AuthenticationData | null {
    return this.store.get('auth') || null;
  }

  /**
   * Checks if user is currently authenticated with valid tokens
   */
  isAuthenticated(): boolean {
    const authData = this.getStoredAuthData();
    if (!authData) {
      return false;
    }

    // Check if token is still valid (with 5 minute buffer)
    const now = new Date();
    const expiresAt = new Date(authData.expiresAt);
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    return now.getTime() < (expiresAt.getTime() - bufferTime);
  }

  /**
   * Refreshes expired access token using stored refresh token
   * Requirements: 1.4 - Automatically refresh expired tokens when possible
   */
  async refreshToken(): Promise<AuthenticationData> {
    const storedAuth = this.getStoredAuthData();
    if (!storedAuth || !storedAuth.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      // Refresh Microsoft token
      const response = await axios.post('https://login.live.com/oauth20_token.srf',
        new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: storedAuth.refreshToken,
          scope: MICROSOFT_SCOPE
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const microsoftToken: MicrosoftTokenResponse = response.data;

      // Re-authenticate through the full chain with new Microsoft token
      const xboxToken = await this.authenticateWithXboxLive(microsoftToken.access_token);
      const xstsToken = await this.getXSTSToken(xboxToken.Token);
      const minecraftToken = await this.authenticateWithMinecraft(
        xstsToken.DisplayClaims.xui[0].uhs,
        xstsToken.Token
      );

      // Update stored authentication data
      const updatedAuthData: AuthenticationData = {
        ...storedAuth,
        accessToken: minecraftToken.access_token,
        refreshToken: microsoftToken.refresh_token,
        expiresAt: new Date(Date.now() + minecraftToken.expires_in * 1000)
      };

      await this.storeAuthData(updatedAuthData);
      return updatedAuthData;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Clear invalid tokens
      this.clearAuthData();
      throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validates current session and refreshes token if needed
   * Requirements: 1.3, 1.4 - Session validation and automatic token refresh
   */
  async validateSession(): Promise<AuthenticationData | null> {
    const storedAuth = this.getStoredAuthData();
    if (!storedAuth) {
      return null;
    }

    // Check if token is still valid
    if (this.isAuthenticated()) {
      return storedAuth;
    }

    // Try to refresh token if expired
    try {
      return await this.refreshToken();
    } catch (error) {
      console.error('Session validation failed:', error);
      return null;
    }
  }

  /**
   * Validates Minecraft token by making a test API call
   */
  async validateMinecraftToken(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get(MINECRAFT_PROFILE_URL, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 5000 // 5 second timeout
      });

      return response.status === 200;
    } catch (error) {
      console.error('Minecraft token validation failed:', error);
      return false;
    }
  }

  /**
   * Performs logout by clearing stored credentials and closing auth window
   * Requirements: 1.4 - Add logout functionality with credential cleanup
   */
  async logout(): Promise<void> {
    try {
      // Close authentication window if open
      if (this.authWindow && !this.authWindow.isDestroyed()) {
        this.authWindow.close();
        this.authWindow = null;
      }

      // Clear stored authentication data
      this.clearAuthData();

      // Optional: Revoke tokens with Microsoft (best practice)
      // Note: Microsoft doesn't provide a standard revocation endpoint for this flow
      // The tokens will expire naturally
      
      console.log('User logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local data even if remote revocation fails
      this.clearAuthData();
    }
  }

  /**
   * Gets current user profile information
   */
  getCurrentUser(): { id: string; name: string; skinUrl?: string } | null {
    const authData = this.getStoredAuthData();
    return authData?.userProfile || null;
  }

  /**
   * Checks if the user owns Minecraft (has a valid profile)
   */
  async checkMinecraftOwnership(): Promise<boolean> {
    const authData = this.getStoredAuthData();
    if (!authData) {
      return false;
    }

    try {
      const isValid = await this.validateMinecraftToken(authData.accessToken);
      return isValid;
    } catch (error) {
      console.error('Minecraft ownership check failed:', error);
      return false;
    }
  }

  /**
   * Clears stored authentication data
   */
  clearAuthData(): void {
    this.store.delete('auth');
  }
}