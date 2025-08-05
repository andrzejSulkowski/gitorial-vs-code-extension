import * as path from 'path';
import * as os from 'os';

export interface PathValidationResult {
  isValid: boolean;
  sanitizedPath?: string;
  error?: string;
}

export interface PathValidationOptions {
  allowAbsolute?: boolean;
  allowRelative?: boolean;
  restrictToUserHome?: boolean;
  maxDepth?: number;
  maxLength?: number;
  allowedExtensions?: string[];
}

/**
 * Security-focused path sanitizer and validator
 * Provides protection against path traversal attacks and unauthorized file access
 */
export class PathSanitizer {
  private static readonly DEFAULT_OPTIONS: Required<PathValidationOptions> = {
    allowAbsolute: true,
    allowRelative: false,
    restrictToUserHome: true,
    maxDepth: 10,
    maxLength: 260, // Windows MAX_PATH limit
    allowedExtensions: ['.git', '.md', '.json', '.txt', '.yml', '.yaml'],
  };

  /**
   * Sanitizes and validates a file system path
   */
  public static sanitizePath(
    inputPath: string,
    options: PathValidationOptions = {},
  ): PathValidationResult {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      // Basic input validation
      if (!inputPath || typeof inputPath !== 'string') {
        return { isValid: false, error: 'Path must be a non-empty string' };
      }

      // Length check
      if (inputPath.length > opts.maxLength) {
        return { isValid: false, error: `Path exceeds maximum length of ${opts.maxLength} characters` };
      }

      // Remove dangerous characters and patterns
      const cleanedPath = this.removeDangerousPatterns(inputPath);
      if (!cleanedPath) {
        return { isValid: false, error: 'Path contains dangerous patterns' };
      }

      // Normalize path separators
      const normalizedPath = path.normalize(cleanedPath);

      // Check for path traversal attempts
      if (this.containsPathTraversal(normalizedPath)) {
        return { isValid: false, error: 'Path traversal patterns detected' };
      }

      // Validate path type (absolute vs relative)
      const isAbsolute = path.isAbsolute(normalizedPath);
      if (isAbsolute && !opts.allowAbsolute) {
        return { isValid: false, error: 'Absolute paths not allowed' };
      }
      if (!isAbsolute && !opts.allowRelative) {
        return { isValid: false, error: 'Relative paths not allowed' };
      }

      // Restrict to user home directory if required
      if (opts.restrictToUserHome && isAbsolute) {
        const userHome = os.homedir();
        if (!normalizedPath.startsWith(userHome)) {
          return { isValid: false, error: 'Path must be within user home directory' };
        }
      }

      // Check path depth
      const pathParts = normalizedPath.split(path.sep).filter(part => part.length > 0);
      if (pathParts.length > opts.maxDepth) {
        return { isValid: false, error: `Path depth exceeds maximum of ${opts.maxDepth}` };
      }

      // Validate each path component
      for (const part of pathParts) {
        if (!this.isValidPathComponent(part)) {
          return { isValid: false, error: `Invalid path component: ${part}` };
        }
      }

      // Validate file extension if it's a file path
      const ext = path.extname(normalizedPath);
      if (ext && opts.allowedExtensions.length > 0 && !opts.allowedExtensions.includes(ext)) {
        return {
          isValid: false,
          error: `File extension '${ext}' not allowed. Allowed: ${opts.allowedExtensions.join(', ')}`,
        };
      }

      return { isValid: true, sanitizedPath: normalizedPath };

    } catch (error) {
      return {
        isValid: false,
        error: `Path validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Removes dangerous patterns from path input
   */
  private static removeDangerousPatterns(inputPath: string): string | null {
    // Patterns that should never appear in safe paths
    const dangerousPatterns = [
      /\.\./g,           // Path traversal
      /[<>:"|?*]/g,      // Windows reserved characters
      /[\x00-\x1f]/g,    // Control characters
      /\$\{.*\}/g,       // Variable substitution patterns
      /`.*`/g,           // Command substitution
      /\||\&\&|\|\|/g,   // Command chaining
    ];

    let cleaned = inputPath.trim();

    // Check for dangerous patterns
    for (const pattern of dangerousPatterns) {
      if (pattern.test(cleaned)) {
        return null;
      }
    }

    // Remove potentially dangerous sequences
    cleaned = cleaned
      .replace(/\/+/g, '/') // Multiple slashes
      .replace(/\\+/g, '\\') // Multiple backslashes
      .replace(/\s+/g, ' ') // Multiple spaces
      .replace(/^\.+/, '') // Leading dots
      .replace(/\.+$/, ''); // Trailing dots

    return cleaned || null;
  }

  /**
   * Checks for path traversal patterns
   */
  private static containsPathTraversal(normalizedPath: string): boolean {
    const traversalPatterns = [
      /\.\./,
      /\.\/\.\./,
      /\.\\\.\./,
      /%2e%2e/i,
      /%2f/i,
      /%5c/i,
    ];

    return traversalPatterns.some(pattern => pattern.test(normalizedPath));
  }

  /**
   * Validates individual path components
   */
  private static isValidPathComponent(component: string): boolean {
    if (component.length === 0) {
      return false;
    }

    // Check for reserved names on Windows
    const windowsReserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (windowsReserved.test(component)) {
      return false;
    }

    // Check for dangerous characters
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(component)) {
      return false;
    }

    // Check for hidden/system patterns that might be exploited
    if (component.startsWith('.') && component.length > 1) {
      const hiddenPatterns = /^\.(env|git|ssh|aws)$/i;
      if (hiddenPatterns.test(component)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Creates a safe directory path for cloning repositories
   */
  public static createSafeClonePath(basePath: string, repoName: string): PathValidationResult {
    // Sanitize repository name
    const safeName = repoName
      .replace(/[^a-zA-Z0-9\-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    if (!safeName) {
      return { isValid: false, error: 'Repository name could not be sanitized to a safe format' };
    }

    // Create full path
    const fullPath = path.join(basePath, safeName);

    // Check if basePath is a temporary directory
    const tempDir = os.tmpdir();
    const isInTempDir = basePath.startsWith(tempDir);

    // Validate the resulting path
    return this.sanitizePath(fullPath, {
      allowAbsolute: true,
      allowRelative: false,
      restrictToUserHome: !isInTempDir, // Allow temp directories outside user home
      maxDepth: 15,
    });
  }

  /**
   * Validates that a path is safe for file operations
   */
  public static isSafeForFileOperations(filePath: string): boolean {
    const result = this.sanitizePath(filePath, {
      allowAbsolute: true,
      allowRelative: false,
      restrictToUserHome: true,
    });
    return result.isValid;
  }

  /**
   * Gets the safe temporary directory for the current user
   */
  public static getSafeTempDirectory(): string {
    const tempDir = os.tmpdir();
    const userHome = os.homedir();

    // Ensure temp directory is within user space or system temp
    if (tempDir.startsWith(userHome) ||
        tempDir.startsWith('/tmp') ||
        tempDir.startsWith('/var/tmp') ||
        tempDir.startsWith('/var/folders')) { // macOS temp directory
      return tempDir;
    }

    // Fallback to user home if system temp seems unsafe
    return path.join(userHome, '.tmp');
  }

  /**
   * Creates a safe subdirectory within the temp directory
   */
  public static createSafeTempPath(subdirectoryName: string): PathValidationResult {
    const safeTempDir = this.getSafeTempDirectory();
    const safeSubdir = subdirectoryName
      .replace(/[^a-zA-Z0-9\-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!safeSubdir) {
      return { isValid: false, error: 'Subdirectory name could not be sanitized' };
    }

    const fullPath = path.join(safeTempDir, safeSubdir);
    return this.sanitizePath(fullPath, {
      allowAbsolute: true,
      allowRelative: false,
      restrictToUserHome: false, // Temp directories might be outside user home
      maxDepth: 10,
    });
  }
}

