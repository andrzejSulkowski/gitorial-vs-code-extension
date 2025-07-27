export interface CommandValidationResult {
  isValid: boolean;
  sanitizedCommand?: string;
  sanitizedArgs?: string[];
  error?: string;
}

export interface CommandValidationOptions {
  allowedCommands?: string[];
  allowedFlags?: string[];
  maxArguments?: number;
  requireExactMatch?: boolean;
}

/**
 * Security-focused command validator for safe command execution
 * Provides protection against command injection and unauthorized command execution
 */
export class CommandValidator {
  private static readonly DEFAULT_OPTIONS: Required<CommandValidationOptions> = {
    allowedCommands: ['git'],
    allowedFlags: [
      // Git flags commonly used in the extension
      'clone', 'checkout', 'status', 'log', 'diff', 'remote', 'branch',
      '--oneline', '--format', '--pretty', '--no-merges', '--reverse',
      '--quiet', '-q', '--progress', '--recursive', '--depth',
    ],
    maxArguments: 10,
    requireExactMatch: true,
  };

  // Git subcommands that are safe for this extension's use case
  private static readonly SAFE_GIT_SUBCOMMANDS = [
    'clone',
    'checkout',
    'status',
    'log',
    'diff',
    'remote',
    'branch',
    'show',
    'ls-remote',
    'rev-parse',
    'config',
  ];

  // Git flags that are safe and commonly used
  private static readonly SAFE_GIT_FLAGS = [
    '--oneline',
    '--format',
    '--pretty',
    '--no-merges',
    '--reverse',
    '--quiet',
    '-q',
    '--progress',
    '--recursive',
    '--depth',
    '--branch',
    '-b',
    '--single-branch',
    '--no-checkout',
    '--bare',
    '--get',
  ];

  /**
   * Validates and sanitizes a command with arguments
   */
  public static validateCommand(
    command: string,
    args: string[] = [],
    options: CommandValidationOptions = {},
  ): CommandValidationResult {
    const opts = {
      ...this.DEFAULT_OPTIONS,
      ...options,
      allowedCommands: options.allowedCommands || this.DEFAULT_OPTIONS.allowedCommands,
      allowedFlags: options.allowedFlags || [...this.SAFE_GIT_FLAGS, ...this.SAFE_GIT_SUBCOMMANDS],
    };

    try {
      // Basic input validation
      if (!command || typeof command !== 'string') {
        return { isValid: false, error: 'Command must be a non-empty string' };
      }

      // Sanitize command name
      const sanitizedCommand = this.sanitizeCommandName(command);
      if (!sanitizedCommand) {
        return { isValid: false, error: 'Command contains invalid characters' };
      }

      // Check if command is allowed
      if (!opts.allowedCommands.includes(sanitizedCommand)) {
        return {
          isValid: false,
          error: `Command '${sanitizedCommand}' not allowed. Allowed commands: ${opts.allowedCommands.join(', ')}`,
        };
      }

      // Validate argument count
      if (args.length > opts.maxArguments) {
        return { isValid: false, error: `Too many arguments. Maximum allowed: ${opts.maxArguments}` };
      }

      // Sanitize and validate arguments
      const sanitizedArgs: string[] = [];
      for (let i = 0; i < args.length; i++) {
        const argResult = this.sanitizeArgument(args[i], sanitizedCommand, opts);
        if (!argResult.isValid) {
          return { isValid: false, error: `Argument ${i + 1}: ${argResult.error}` };
        }
        if (argResult.sanitizedArg) {
          sanitizedArgs.push(argResult.sanitizedArg);
        }
      }

      // Command-specific validation
      const specificResult = this.validateSpecificCommand(sanitizedCommand, sanitizedArgs);
      if (!specificResult.isValid) {
        return specificResult;
      }

      return {
        isValid: true,
        sanitizedCommand,
        sanitizedArgs,
      };

    } catch (error) {
      return {
        isValid: false,
        error: `Command validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Sanitizes command name to prevent injection
   */
  private static sanitizeCommandName(command: string): string | null {
    // Remove any dangerous characters
    const cleaned = command.trim().toLowerCase();

    // Check for injection patterns
    const dangerousPatterns = [
      /[;&|`$(){}[\]<>]/,  // Command injection characters
      /\s/,                // Whitespace (commands shouldn't have spaces)
      /\./,                // Dots (prevent path traversal)
      /\\/,                // Backslashes
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(cleaned)) {
        return null;
      }
    }

    // Only allow alphanumeric and hyphens
    if (!/^[a-z0-9-]+$/.test(cleaned)) {
      return null;
    }

    return cleaned;
  }

  /**
   * Sanitizes and validates individual command arguments
   */
  private static sanitizeArgument(
    arg: string,
    command: string,
    options: Required<CommandValidationOptions>,
  ): { isValid: boolean; sanitizedArg?: string; error?: string } {
    if (!arg || typeof arg !== 'string') {
      return { isValid: false, error: 'Argument must be a non-empty string' };
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /[;&|`$(){}[\]]/,    // Command injection
      /\$\{.*\}/,          // Variable substitution
      /`.*`/,              // Command substitution
      /\|\||\&\&/,         // Command chaining
      />\s*\/|<\s*\//,     // File redirection to system paths
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(arg)) {
        return { isValid: false, error: 'Argument contains dangerous patterns' };
      }
    }

    const trimmed = arg.trim();

    // For git commands, validate flags and subcommands
    if (command === 'git') {
      if (trimmed.startsWith('-')) {
        // This is a flag
        if (!options.allowedFlags.includes(trimmed)) {
          return {
            isValid: false,
            error: `Git flag '${trimmed}' not allowed`,
          };
        }
      } else if (this.SAFE_GIT_SUBCOMMANDS.includes(trimmed)) {
        // This is a subcommand
        return { isValid: true, sanitizedArg: trimmed };
      } else {
        // This might be a URL, path, or other argument
        const sanitized = this.sanitizeGitArgument(trimmed);
        if (!sanitized) {
          return { isValid: false, error: 'Git argument contains invalid patterns' };
        }
        return { isValid: true, sanitizedArg: sanitized };
      }
    }

    return { isValid: true, sanitizedArg: trimmed };
  }

  /**
   * Sanitizes arguments specific to git commands
   */
  private static sanitizeGitArgument(arg: string): string | null {
    // For URLs, allow HTTPS git URLs only
    if (arg.startsWith('https://')) {
      // Validate using existing URL validator patterns
      const urlPattern = /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(?:\.git)?$/;
      if (!urlPattern.test(arg)) {
        return null;
      }
      return arg;
    }

    // For paths, ensure they don't contain dangerous patterns
    if (arg.includes('..') || arg.includes('~') || arg.startsWith('/etc') || arg.startsWith('/root')) {
      return null;
    }

    // For other arguments (branch names, commit hashes, etc.)
    // Allow alphanumeric, dots, hyphens, underscores, and forward slashes
    if (!/^[a-zA-Z0-9.\-_/]+$/.test(arg)) {
      return null;
    }

    return arg;
  }

  /**
   * Performs command-specific validation
   */
  private static validateSpecificCommand(command: string, args: string[]): CommandValidationResult {
    if (command === 'git') {
      return this.validateGitCommand(args);
    }

    return { isValid: true };
  }

  /**
   * Validates git command arguments
   */
  private static validateGitCommand(args: string[]): CommandValidationResult {
    if (args.length === 0) {
      return { isValid: false, error: 'Git command requires subcommand' };
    }

    const subcommand = args[0];

    if (!this.SAFE_GIT_SUBCOMMANDS.includes(subcommand)) {
      return {
        isValid: false,
        error: `Git subcommand '${subcommand}' not allowed. Allowed: ${this.SAFE_GIT_SUBCOMMANDS.join(', ')}`,
      };
    }

    // Specific validation for clone command
    if (subcommand === 'clone') {
      // Find the URL argument (should be the first non-flag argument after 'clone')
      let urlFound = false;
      for (let i = 1; i < args.length; i++) {
        if (!args[i].startsWith('-') && !urlFound) {
          // This should be the URL
          if (!args[i].startsWith('https://')) {
            return { isValid: false, error: 'Git clone only supports HTTPS URLs' };
          }
          urlFound = true;
        }
      }

      if (!urlFound) {
        return { isValid: false, error: 'Git clone requires a repository URL' };
      }
    }

    return { isValid: true };
  }

  /**
   * Quick validation for common git operations
   */
  public static isValidGitCommand(subcommand: string, args: string[] = []): boolean {
    const result = this.validateCommand('git', [subcommand, ...args]);
    return result.isValid;
  }

  /**
   * Creates a validated git clone command
   */
  public static createSafeGitCloneCommand(repoUrl: string, targetPath: string): CommandValidationResult {
    const args = ['clone', repoUrl, targetPath];
    return this.validateCommand('git', args);
  }

  /**
   * Creates a validated git checkout command
   */
  public static createSafeGitCheckoutCommand(commitHash: string): CommandValidationResult {
    // Validate commit hash format (40 char hex or short form)
    if (!/^[a-f0-9]{7,40}$/.test(commitHash)) {
      return { isValid: false, error: 'Invalid commit hash format' };
    }

    const args = ['checkout', commitHash];
    return this.validateCommand('git', args);
  }
}
