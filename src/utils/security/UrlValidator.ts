import { URL } from 'url';

export interface UrlValidationResult {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
}

export interface UrlValidationOptions {
  allowedProtocols?: string[];
  allowedHosts?: string[];
  requireHttps?: boolean;
  maxLength?: number;
}

/**
 * Security-focused URL validator for repository URLs
 * Provides protection against malicious URLs and enforces security policies
 */
export class UrlValidator {
  private static readonly DEFAULT_OPTIONS: Required<UrlValidationOptions> = {
    allowedProtocols: ['https', 'ssh'],
    allowedHosts: [
      'github.com',
      'gitlab.com',
      'bitbucket.org',
      'codeberg.org',
      'sourceforge.net',
    ],
    requireHttps: true,
    maxLength: 2048,
  };

  /**
   * Validates a repository URL for security and format compliance
   */
  public static validateRepositoryUrl(
    url: string,
    options: UrlValidationOptions = {},
  ): UrlValidationResult {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      // Basic input validation
      if (!url || typeof url !== 'string') {
        return { isValid: false, error: 'URL must be a non-empty string' };
      }

      // Length check
      if (url.length > opts.maxLength) {
        return { isValid: false, error: `URL exceeds maximum length of ${opts.maxLength} characters` };
      }

      // Remove dangerous characters and potential injection attempts
      const sanitizedUrl = this.sanitizeUrl(url);
      if (!sanitizedUrl) {
        return { isValid: false, error: 'URL contains invalid or dangerous characters' };
      }

      // Parse URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(sanitizedUrl);
      } catch {
        return { isValid: false, error: 'Invalid URL format' };
      }

      // Protocol validation
      if (!opts.allowedProtocols.includes(parsedUrl.protocol.replace(':', ''))) {
        return {
          isValid: false,
          error: `Protocol '${parsedUrl.protocol}' not allowed. Allowed protocols: ${opts.allowedProtocols.join(', ')}`,
        };
      }

      // HTTPS requirement
      if (opts.requireHttps && parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'ssh:') {
        return { isValid: false, error: 'HTTPS protocol required for security' };
      }

      // Host validation
      const hostname = parsedUrl.hostname.toLowerCase();
      if (!this.isHostAllowed(hostname, opts.allowedHosts)) {
        return {
          isValid: false,
          error: `Host '${hostname}' not allowed. Allowed hosts: ${opts.allowedHosts.join(', ')}`,
        };
      }

      // Additional security checks
      const securityResult = this.performSecurityChecks(parsedUrl);
      if (!securityResult.isValid) {
        return securityResult;
      }

      // Normalize URL
      const normalizedUrl = this.normalizeUrl(parsedUrl);

      return { isValid: true, normalizedUrl };

    } catch (error) {
      return {
        isValid: false,
        error: `URL validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Sanitizes URL input to remove dangerous characters
   */
  private static sanitizeUrl(url: string): string | null {
    // Remove potential injection attempts
    const dangerous = [
      'javascript:',
      'data:',
      'vbscript:',
      'file:',
      'ftp:',
      '<script',
      '</script>',
      'onclick',
      'onerror',
      'onload',
    ];

    const lowerUrl = url.toLowerCase();
    for (const danger of dangerous) {
      if (lowerUrl.includes(danger)) {
        return null;
      }
    }

    // Remove whitespace and common problematic characters
    return url.trim()
      .replace(/[\r\n\t]/g, '')
      .replace(/[<>]/g, '');
  }

  /**
   * Checks if hostname is in allowed list (supports wildcards)
   */
  private static isHostAllowed(hostname: string, allowedHosts: string[]): boolean {
    return allowedHosts.some(allowed => {
      if (allowed === hostname) {
        return true;
      }
      if (allowed.startsWith('*.')) {
        const domain = allowed.substring(2);
        return hostname.endsWith('.' + domain) || hostname === domain;
      }
      return false;
    });
  }

  /**
   * Performs additional security checks on parsed URL
   */
  private static performSecurityChecks(url: URL): UrlValidationResult {
    // Check for suspicious patterns in path
    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /\/\//,  // Double slashes (potential redirect)
      /%[0-9a-f]{2}/i,  // URL encoding (potential obfuscation)
      /[<>'"]/,  // HTML injection characters
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url.pathname)) {
        return { isValid: false, error: 'URL contains suspicious patterns' };
      }
    }

    // Check for non-standard ports (except SSH default)
    if (url.port && url.port !== '22' && url.port !== '443' && url.port !== '80') {
      return { isValid: false, error: 'Non-standard ports not allowed for security' };
    }

    // Validate repository path structure
    if (url.protocol === 'https:') {
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      if (pathParts.length < 2) {
        return { isValid: false, error: 'Repository URL must include owner and repository name' };
      }
    }

    return { isValid: true };
  }

  /**
   * Normalizes URL for consistent handling
   */
  private static normalizeUrl(url: URL): string {
    // Remove trailing slash and .git extension
    let normalizedPath = url.pathname.replace(/\/$/, '').replace(/\.git$/, '');

    // Ensure proper repository path format
    return `${url.protocol}//${url.hostname}${normalizedPath}`;
  }

  /**
   * Quick validation for common repository URL patterns
   */
  public static isValidGitRepositoryUrl(url: string): boolean {
    const result = this.validateRepositoryUrl(url);
    return result.isValid;
  }

  /**
   * Extracts safe repository information from validated URL
   */
  public static extractRepositoryInfo(url: string): {
    platform: string;
    owner: string;
    repo: string;
  } | null {
    const validation = this.validateRepositoryUrl(url);
    if (!validation.isValid || !validation.normalizedUrl) {
      return null;
    }

    try {
      const parsedUrl = new URL(validation.normalizedUrl);
      const pathParts = parsedUrl.pathname.split('/').filter(part => part.length > 0);

      if (pathParts.length < 2) {
        return null;
      }

      const platform = parsedUrl.hostname.split('.')[0]; // github, gitlab, etc.
      return {
        platform,
        owner: pathParts[0],
        repo: pathParts[1],
      };
    } catch {
      return null;
    }
  }
}

