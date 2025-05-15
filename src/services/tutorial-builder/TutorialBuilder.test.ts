import { expect } from 'chai';
import { TutorialBuilder } from './TutorialBuilder';
import { TutorialId } from '../../../shared/types'; // Adjust path as necessary if your shared types are elsewhere

describe('TutorialBuilder', () => {
  describe('generateTutorialId', () => {
    // Test valid inputs
    it('should generate a valid ID from an HTTPS URL', () => {
      const url = 'https://github.com/test-user/test-repo.git';
      expect(TutorialBuilder.generateTutorialId(url)).to.equal('test-repo' as TutorialId);
    });

    it('should generate a valid ID from an HTTPS URL without .git', () => {
      const url = 'https://github.com/test-user/another-repo';
      expect(TutorialBuilder.generateTutorialId(url)).to.equal('another-repo' as TutorialId);
    });

    it('should generate a valid ID from an SSH URL', () => {
      const url = 'git@github.com:test-user/ssh-repo.git';
      expect(TutorialBuilder.generateTutorialId(url)).to.equal('ssh-repo' as TutorialId);
    });

    it('should generate a valid ID from an SSH URL without .git and with different separator', () => {
      const url = 'git@gitlab.com/group/project-name';
      expect(TutorialBuilder.generateTutorialId(url)).to.equal('project-name' as TutorialId);
    });

    it('should generate a valid ID from a simple name', () => {
      const name = 'my-simple-tutorial';
      expect(TutorialBuilder.generateTutorialId(name)).to.equal('my-simple-tutorial' as TutorialId);
    });
    
    it('should handle paths by taking the basename', () => {
      expect(TutorialBuilder.generateTutorialId('path/to/my-repo')).to.equal('my-repo' as TutorialId);
      expect(TutorialBuilder.generateTutorialId('../another/path/to/your-repo.git')).to.equal('your-repo' as TutorialId);
    });

    it('should sanitize special characters', () => {
      const url = 'https://example.com/user/repo_with_spaces_and_Chars!@#$%^&*.git';
      expect(TutorialBuilder.generateTutorialId(url)).to.equal('repo-with-spaces-and-Chars--------' as TutorialId);
    });
    
    it('should handle URL with trailing slash', () => {
      const url = 'https://github.com/test-user/trailing-slash/';
      expect(TutorialBuilder.generateTutorialId(url)).to.equal('trailing-slash' as TutorialId);
    });

    // Test error conditions based on the implementation in TutorialBuilder.ts
    it('should throw an error for an empty URL', () => {
      expect(() => TutorialBuilder.generateTutorialId('')).to.throw('Repository URL cannot be empty.');
    });

    it('should throw an error for a blank URL', () => {
      expect(() => TutorialBuilder.generateTutorialId('   ')).to.throw('Repository URL cannot be empty.');
    });

    it('should throw an error if no repository name can be extracted from URL path (e.g. domain only)', () => {
      const url = 'https://example.com';
      expect(() => TutorialBuilder.generateTutorialId(url)).to.throw('Could not extract repository name from URL path: https://example.com');
    });
    
    it('should throw an error for SSH URL that doesn\'t resolve to a name properly', () => {
      const url = 'git@github.com:'; // Ends with separator, basename might be empty or problematic
      expect(() => TutorialBuilder.generateTutorialId(url)).to.throw(/^Invalid repository name extracted or derived from URL:/);
    });
    
    it('should throw an error for path that resolves to an invalid name like .', () => {
      const url = 'path/to/.';
      expect(() => TutorialBuilder.generateTutorialId(url)).to.throw(/^Invalid repository name extracted or derived from URL:/);
    });

    it('should throw an error if the sanitized ID is empty (e.g. URL path segment with only special chars)', () => {
      const url = 'https://example.com/user/!@#$%.git';
      expect(() => TutorialBuilder.generateTutorialId(url)).to.throw(/^Generated ID is empty or invalid after sanitization from URL:/);
    });
    
    it('should throw an error if the name consists only of special characters that get stripped to nothing', () => {
      const name = '@@@###$$$';
       expect(() => TutorialBuilder.generateTutorialId(name)).to.throw(/^Generated ID is empty or invalid after sanitization from URL:/);
    });
  });

  describe('formatTitleFromId', () => {
    it('should format a simple ID', () => {
      const id = 'my-tutorial' as TutorialId;
      expect(TutorialBuilder.formatTitleFromId(id)).to.equal('My Tutorial');
    });

    it('should format an ID with hyphens and underscores', () => {
      const id = 'another_tutorial-with-mixed_separators' as TutorialId;
      expect(TutorialBuilder.formatTitleFromId(id)).to.equal('Another Tutorial With Mixed Separators');
    });

    it('should handle single word IDs', () => {
      const id = 'project' as TutorialId;
      expect(TutorialBuilder.formatTitleFromId(id)).to.equal('Project');
    });

    it('should handle IDs with numbers', () => {
      const id = 'tutorial-101-example' as TutorialId;
      expect(TutorialBuilder.formatTitleFromId(id)).to.equal('Tutorial 101 Example');
    });

    it('should handle an ID that is all uppercase (should still capitalize first letters)', () => {
      const id = 'ALLCAPS-ID' as TutorialId;
      expect(TutorialBuilder.formatTitleFromId(id)).to.equal('Allcaps Id'); // Current behavior: only first letter of word
    });

    it('should handle an ID with leading/trailing hyphens (they become spaces and are trimmed by effect)', () => {
      const id = '-leading-and-trailing-' as TutorialId;
      const result = TutorialBuilder.formatTitleFromId(id);
      expect(result).to.equal('Leading And Trailing'); // Current: spaces remain, then words capitalized
    });
  });
});
