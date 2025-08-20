import { strict as assert } from 'assert';
import { CommitHashSanitizer } from './CommitHashSanitizer';

describe('CommitHashSanitizer', () => {
  const validHash = 'c74cd10a4d1aa6a0af4be62c131e5d75bb8a0f44';

  describe('sanitize', () => {
    it('should return clean hash unchanged', () => {
      assert.strictEqual(CommitHashSanitizer.sanitize(validHash), validHash);
    });

    it('should extract hash from HEAD prefix', () => {
      const malformed = `HEAD ${validHash}`;
      assert.strictEqual(CommitHashSanitizer.sanitize(malformed), validHash);
    });

    it('should extract hash from commit prefix', () => {
      const malformed = `commit ${validHash}`;
      assert.strictEqual(CommitHashSanitizer.sanitize(malformed), validHash);
    });

    it('should extract hash from origin prefix', () => {
      const malformed = `origin/main ${validHash}`;
      assert.strictEqual(CommitHashSanitizer.sanitize(malformed), validHash);
    });

    it('should handle hash with extra whitespace', () => {
      const malformed = `  HEAD  ${validHash}  `;
      assert.strictEqual(CommitHashSanitizer.sanitize(malformed), validHash);
    });

    it('should throw error for invalid input', () => {
      assert.throws(() => CommitHashSanitizer.sanitize(''));
      assert.throws(() => CommitHashSanitizer.sanitize('invalid'));
      assert.throws(() => CommitHashSanitizer.sanitize('HEAD invalid'));
    });

    it('should handle the specific HEAD.c74 pattern from the original bug', () => {
      // This tests the specific case that was causing the original navigation issue
      const truncatedHash = 'c74cd10a4d1aa6a0af4be62c131e5d75bb8a0f44';
      const malformedInput = `HEAD.${truncatedHash.substring(0, 3)}`;

      // This should throw an error because "HEAD.c74" is not a valid pattern
      assert.throws(() => CommitHashSanitizer.sanitize(malformedInput),
        /Could not extract valid commit hash/,
      );
    });
  });

  describe('isValid', () => {
    it('should return true for valid hashes', () => {
      assert.strictEqual(CommitHashSanitizer.isValid(validHash), true);
      assert.strictEqual(CommitHashSanitizer.isValid(`HEAD ${validHash}`), true);
    });

    it('should return false for invalid hashes', () => {
      assert.strictEqual(CommitHashSanitizer.isValid(''), false);
      assert.strictEqual(CommitHashSanitizer.isValid('invalid'), false);
      assert.strictEqual(CommitHashSanitizer.isValid('HEAD invalid'), false);
    });
  });

  describe('sanitizeManifestStep', () => {
    it('should sanitize step commit hash', () => {
      const step = {
        commit: `HEAD ${validHash}`,
        type: 'section',
        title: 'test',
      };

      const sanitized = CommitHashSanitizer.sanitizeManifestStep(step);
      assert.strictEqual(sanitized.commit, validHash);
      assert.strictEqual(sanitized.type, 'section');
      assert.strictEqual(sanitized.title, 'test');
    });
  });
});
