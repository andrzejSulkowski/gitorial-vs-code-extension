/**
 * Utility for sanitizing and validating git commit hashes
 */
export class CommitHashSanitizer {
  /**
   * Pattern for a valid git commit hash (40 characters, hexadecimal)
   */
  private static readonly COMMIT_HASH_PATTERN = /^[a-f0-9]{40}$/i;

  /**
   * Pattern for extracting commit hash from strings that may contain prefixes
   * Handles cases like:
   * - "HEAD c74cd10a4d1aa6a0af4be62c131e5d75bb8a0f44"
   * - "commit c74cd10a4d1aa6a0af4be62c131e5d75bb8a0f44"
   * - "origin/main c74cd10a4d1aa6a0af4be62c131e5d75bb8a0f44"
   */
  private static readonly EXTRACT_HASH_PATTERN = /\b([a-f0-9]{40})\b/i;

  /**
   * Sanitizes a commit hash by removing any prefixes and validating format
   * @param input - Raw commit hash string that may contain prefixes
   * @returns Clean commit hash or throws error if invalid
   */
  public static sanitize(input: string): string {
    if (!input || typeof input !== 'string') {
      throw new Error('CommitHashSanitizer: Invalid input - must be a non-empty string');
    }

    const trimmed = input.trim();

    // If it's already a clean commit hash, return it
    if (this.COMMIT_HASH_PATTERN.test(trimmed)) {
      return trimmed;
    }

    // Try to extract commit hash from string with prefixes
    const match = trimmed.match(this.EXTRACT_HASH_PATTERN);
    if (match && match[1]) {
      return match[1];
    }

    throw new Error(`CommitHashSanitizer: Could not extract valid commit hash from: "${input}"`);
  }

  /**
   * Checks if a string is a valid commit hash format
   * @param input - String to validate
   * @returns True if valid commit hash format
   */
  public static isValid(input: string): boolean {
    try {
      const sanitized = this.sanitize(input);
      return this.COMMIT_HASH_PATTERN.test(sanitized);
    } catch {
      return false;
    }
  }

  /**
   * Sanitizes an array of commit hashes
   * @param inputs - Array of potentially malformed commit hashes
   * @returns Array of clean commit hashes
   */
  public static sanitizeArray(inputs: string[]): string[] {
    return inputs.map(input => this.sanitize(input));
  }

  /**
   * Sanitizes commit hashes in a manifest step
   * @param step - Manifest step with potentially malformed commit hash
   * @returns Step with sanitized commit hash
   */
  public static sanitizeManifestStep<T extends { commit: string }>(step: T): T {
    return {
      ...step,
      commit: this.sanitize(step.commit),
    };
  }

  /**
   * Logs warning if commit hash appears to be malformed
   * @param input - Commit hash to check
   * @param context - Context for logging (e.g., "AuthorMode", "Publishing")
   */
  public static logIfMalformed(input: string, context: string = 'GitOperation'): void {
    const trimmed = input.trim();

    // Check for common malformation patterns
    if (trimmed.includes('HEAD ') ||
        trimmed.includes('commit ') ||
        trimmed.includes('origin/') ||
        trimmed.length > 40) {
      console.warn(`${context}: Detected potentially malformed commit hash: "${input}"`);
    }
  }
}
