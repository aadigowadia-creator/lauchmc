import { FabricModService } from '../main/services/fabric-mod-service';
import { ErrorFactory, LauncherError, ErrorCode } from '../main/errors/launcher-error';

// Mock the LoggerService
jest.mock('../main/services/logger-service', () => ({
  LoggerService: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

describe('FabricModService Error Handling', () => {
  let fabricModService: FabricModService;

  beforeEach(() => {
    fabricModService = new FabricModService();
  });

  describe('URL Parsing Error Handling', () => {
    it('should throw LauncherError for invalid Modrinth URL', () => {
      expect(() => {
        fabricModService.parseModrinthUrl('https://invalid-url.com/mod/test');
      }).toThrow(LauncherError);
    });

    it('should throw LauncherError with MOD_INVALID_URL code for invalid URL', () => {
      try {
        fabricModService.parseModrinthUrl('https://invalid-url.com/mod/test');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(LauncherError);
        expect((error as LauncherError).code).toBe(ErrorCode.MOD_INVALID_URL);
      }
    });

    it('should throw LauncherError for invalid CurseForge URL', () => {
      expect(() => {
        fabricModService.parseCurseForgeUrl('https://invalid-url.com/mod/test');
      }).toThrow(LauncherError);
    });

    it('should parse valid Modrinth URL without throwing', () => {
      const result = fabricModService.parseModrinthUrl('https://modrinth.com/mod/sodium');
      expect(result).toHaveProperty('projectId');
      expect(result.projectId).toBe('sodium');
    });

    it('should parse valid CurseForge URL without throwing', () => {
      const result = fabricModService.parseCurseForgeUrl('https://www.curseforge.com/minecraft/mc-mods/jei');
      expect(result).toHaveProperty('projectSlug');
      expect(result.projectSlug).toBe('jei');
    });
  });

  describe('Error Factory', () => {
    it('should create mod download failed error with correct properties', () => {
      const error = ErrorFactory.modDownloadFailed('TestMod', 'Network timeout');
      
      expect(error).toBeInstanceOf(LauncherError);
      expect(error.code).toBe(ErrorCode.MOD_DOWNLOAD_FAILED);
      expect(error.userMessage).toContain('TestMod');
      expect(error.userMessage).toContain('Network timeout');
      expect(error.solution).toBeDefined();
      expect(error.solution.steps).toBeInstanceOf(Array);
      expect(error.solution.steps.length).toBeGreaterThan(0);
    });

    it('should create mod version not found error', () => {
      const error = ErrorFactory.modVersionNotFound('TestMod', '1.20.1');
      
      expect(error).toBeInstanceOf(LauncherError);
      expect(error.code).toBe(ErrorCode.MOD_VERSION_NOT_FOUND);
      expect(error.userMessage).toContain('TestMod');
      expect(error.solution.message).toContain('1.20.1');
    });

    it('should create mod already installed error', () => {
      const error = ErrorFactory.modAlreadyInstalled('TestMod');
      
      expect(error).toBeInstanceOf(LauncherError);
      expect(error.code).toBe(ErrorCode.MOD_ALREADY_INSTALLED);
      expect(error.userMessage).toContain('TestMod');
    });

    it('should create mod integrity check failed error', () => {
      const error = ErrorFactory.modIntegrityCheckFailed('TestMod');
      
      expect(error).toBeInstanceOf(LauncherError);
      expect(error.code).toBe(ErrorCode.MOD_INTEGRITY_CHECK_FAILED);
      expect(error.userMessage).toContain('TestMod');
    });

    it('should create mod API error', () => {
      const error = ErrorFactory.modApiError('Modrinth');
      
      expect(error).toBeInstanceOf(LauncherError);
      expect(error.code).toBe(ErrorCode.MOD_API_ERROR);
      expect(error.userMessage).toContain('Modrinth');
    });

    it('should create mod dependency missing error', () => {
      const error = ErrorFactory.modDependencyMissing('TestMod', ['Fabric API', 'Cloth Config']);
      
      expect(error).toBeInstanceOf(LauncherError);
      expect(error.code).toBe(ErrorCode.MOD_DEPENDENCY_MISSING);
      expect(error.userMessage).toContain('TestMod');
      expect(error.solution.message).toContain('Fabric API');
      expect(error.solution.message).toContain('Cloth Config');
    });
  });

  describe('LauncherError Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const error = ErrorFactory.modDownloadFailed('TestMod', 'Test reason');
      const json = error.toJSON();
      
      expect(json).toHaveProperty('name');
      expect(json).toHaveProperty('code');
      expect(json).toHaveProperty('userMessage');
      expect(json).toHaveProperty('solution');
      expect(json.code).toBe(ErrorCode.MOD_DOWNLOAD_FAILED);
    });

    it('should include original error in serialization if present', () => {
      const originalError = new Error('Original error message');
      const error = ErrorFactory.modDownloadFailed('TestMod', 'Test reason', originalError);
      const json = error.toJSON();
      
      expect(json).toHaveProperty('originalError');
      expect(json.originalError).toHaveProperty('message');
      expect(json.originalError?.message).toBe('Original error message');
    });
  });
});
