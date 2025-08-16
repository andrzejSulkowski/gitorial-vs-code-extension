import * as path from 'path';
import { IFileSystem } from '@domain/ports/IFileSystem';

/**
 * Language-specific .gitignore templates
 */
const GITIGNORE_TEMPLATES = {
  rust: [
    '# Rust build artifacts',
    'target/',
    'Cargo.lock',
    '',
    '# Gitorial files',
    '.gitorial/',
    '',
    '# IDE files and language server artifacts',
    '.vscode/',
    '.idea/',
    '*.swp',
    '*.swo',
    '',
    '# Rust analyzer and language server files',
    '.rust-analyzer/',
    'rust-project.json',
    '',
    '# VS Code workspace files',
    '*.code-workspace',
    '',
    '# OS files',
    '.DS_Store',
    'Thumbs.db',
    '',
    '# Temporary files',
    '*.tmp',
    '*.temp',
    '',
    '# Debug files',
    '*.pdb',
    '',
  ].join('\n'),

  javascript: [
    '# Dependencies',
    'node_modules/',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    '',
    '# Gitorial files',
    '.gitorial/',
    '',
    '# Build outputs',
    'dist/',
    'build/',
    '.next/',
    '',
    '# IDE files',
    '.vscode/',
    '.idea/',
    '',
    '# OS files',
    '.DS_Store',
    'Thumbs.db',
    '',
    '# Environment files',
    '.env',
    '.env.local',
    '',
  ].join('\n'),

  typescript: [
    '# Dependencies',
    'node_modules/',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    '',
    '# Gitorial files',
    '.gitorial/',
    '',
    '# Build outputs',
    'dist/',
    'build/',
    '.next/',
    '*.tsbuildinfo',
    '',
    '# IDE files',
    '.vscode/',
    '.idea/',
    '',
    '# OS files',
    '.DS_Store',
    'Thumbs.db',
    '',
    '# Environment files',
    '.env',
    '.env.local',
    '',
  ].join('\n'),

  python: [
    '# Python build artifacts',
    '__pycache__/',
    '*.py[cod]',
    '*$py.class',
    '*.so',
    'build/',
    'develop-eggs/',
    'dist/',
    'downloads/',
    'eggs/',
    '.eggs/',
    'lib/',
    'lib64/',
    'parts/',
    'sdist/',
    'var/',
    'wheels/',
    '*.egg-info/',
    '.installed.cfg',
    '*.egg',
    '',
    '# Gitorial files',
    '.gitorial/',
    '',
    '# Virtual environments',
    'venv/',
    'env/',
    '.venv/',
    '.env/',
    '',
    '# IDE files',
    '.vscode/',
    '.idea/',
    '*.swp',
    '*.swo',
    '',
    '# OS files',
    '.DS_Store',
    'Thumbs.db',
    '',
  ].join('\n'),

  go: [
    '# Go build artifacts',
    '*.exe',
    '*.exe~',
    '*.dll',
    '*.so',
    '*.dylib',
    '',
    '# Gitorial files',
    '.gitorial/',
    '',
    '# Test binary',
    '*.test',
    '',
    '# Output of the go coverage tool',
    '*.out',
    '',
    '# Dependency directories',
    'vendor/',
    '',
    '# IDE files',
    '.vscode/',
    '.idea/',
    '',
    '# OS files',
    '.DS_Store',
    'Thumbs.db',
    '',
  ].join('\n'),

  java: [
    '# Java build artifacts',
    '*.class',
    '*.jar',
    '*.war',
    '*.ear',
    '*.aar',
    '',
    '# Gitorial files',
    '.gitorial/',
    '',
    '# Build directories',
    'target/',
    'build/',
    'out/',
    '',
    '# IDE files',
    '.vscode/',
    '.idea/',
    '*.iml',
    '.project',
    '.classpath',
    '.settings/',
    '',
    '# OS files',
    '.DS_Store',
    'Thumbs.db',
    '',
    '# Gradle',
    '.gradle/',
    'gradle-app.setting',
    '',
    '# Maven',
    '.mvn/',
    'mvnw',
    'mvnw.cmd',
    '',
  ].join('\n'),

  csharp: [
    '# Build artifacts',
    'bin/',
    'obj/',
    '*.exe',
    '*.dll',
    '*.pdb',
    '',
    '# Gitorial files',
    '.gitorial/',
    '',
    '# Visual Studio',
    '.vs/',
    '*.suo',
    '*.user',
    '*.userprefs',
    '',
    '# IDE files',
    '.vscode/',
    '.idea/',
    '',
    '# OS files',
    '.DS_Store',
    'Thumbs.db',
    '',
    '# NuGet',
    'packages/',
    '*.nupkg',
    '',
  ].join('\n'),
} as const;

/**
 * Detects project language based on file patterns
 */
export type ProjectLanguage = keyof typeof GITIGNORE_TEMPLATES | 'unknown';

/**
 * Manager for handling .gitignore files in tutorial projects
 */
export class GitignoreManager {
  constructor(private readonly fs: IFileSystem) {}

  /**
   * Detects the primary language of a project based on file patterns
   * @param projectPath Path to the project directory
   * @returns Detected language or 'unknown'
   */
  public async detectProjectLanguage(projectPath: string): Promise<ProjectLanguage> {
    try {
      // Check for language-specific marker files (order matters - most specific first)
      const languageMarkers: Array<{ language: ProjectLanguage; files: string[] }> = [
        {
          language: 'rust',
          files: ['Cargo.toml', 'Cargo.lock']
        },
        {
          language: 'typescript',
          files: ['tsconfig.json', 'package.json'] // Will check for .ts files later if package.json exists
        },
        {
          language: 'javascript',
          files: ['package.json', 'yarn.lock', 'package-lock.json']
        },
        {
          language: 'python',
          files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile']
        },
        {
          language: 'go',
          files: ['go.mod', 'go.sum']
        },
        {
          language: 'java',
          files: ['pom.xml', 'build.gradle', 'gradle.properties']
        },
        {
          language: 'csharp',
          files: ['.csproj', '.sln'] // Will check for actual files with these extensions
        },
      ];

      for (const marker of languageMarkers) {
        for (const file of marker.files) {
          const filePath = this.fs.join(projectPath, file);
          const exists = await this.fs.pathExists(filePath);
          if (exists) {
            // Special case for TypeScript: check if it's actually TypeScript
            if (marker.language === 'typescript' && file === 'package.json') {
              // Try to find TypeScript files or tsconfig.json
              const tsconfigExists = await this.fs.pathExists(this.fs.join(projectPath, 'tsconfig.json'));
              if (tsconfigExists) {
                return 'typescript';
              }
              // Fall through to JavaScript detection
              continue;
            }
            
            // Special case for C#: check for actual project files
            if (marker.language === 'csharp') {
              const hasProjectFile = await this.checkForCSharpProjectFiles(projectPath);
              if (hasProjectFile) {
                return 'csharp';
              }
              continue;
            }
            
            return marker.language;
          }
        }
      }

      return 'unknown';
    } catch (error) {
      console.warn('GitignoreManager: Error detecting project language:', error);
      return 'unknown';
    }
  }

  /**
   * Checks for C# project files (.csproj, .sln) by testing common patterns
   */
  private async checkForCSharpProjectFiles(projectPath: string): Promise<boolean> {
    // Common C# project file patterns to check
    const patterns = [
      'App.csproj',
      'Program.csproj',
      'Project.csproj',
      'Solution.sln',
      'App.sln',
    ];
    
    for (const pattern of patterns) {
      const filePath = this.fs.join(projectPath, pattern);
      const exists = await this.fs.pathExists(filePath);
      if (exists) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Ensures appropriate .gitignore exists for the detected project language
   * @param projectPath Path to the project directory
   * @returns True if .gitignore was created/updated, false otherwise
   */
  public async ensureGitignore(projectPath: string): Promise<boolean> {
    try {
      const language = await this.detectProjectLanguage(projectPath);
      
      if (language === 'unknown') {
        console.log('GitignoreManager: Unknown project language, skipping .gitignore creation');
        return false;
      }

      const gitignorePath = path.join(projectPath, '.gitignore');
      const template = GITIGNORE_TEMPLATES[language];

      // Check if .gitignore already exists
      const exists = await this.fs.pathExists(gitignorePath);
      
      if (exists) {
        // Check if it already contains the essential patterns for this language
        const existingContent = await this.fs.readFile(gitignorePath);
        const hasEssentialPatterns = this.hasEssentialPatterns(existingContent, language);
        
        if (hasEssentialPatterns) {
          console.log(`GitignoreManager: .gitignore already contains essential ${language} patterns`);
          return false;
        } else {
          // Append essential patterns to existing .gitignore
          await this.appendEssentialPatterns(gitignorePath, existingContent, language);
          console.log(`GitignoreManager: Updated .gitignore with essential ${language} patterns`);
          return true;
        }
      } else {
        // Create new .gitignore with full template
        await this.fs.writeFile(gitignorePath, template);
        console.log(`GitignoreManager: Created .gitignore for ${language} project`);
        return true;
      }
    } catch (error) {
      console.error('GitignoreManager: Error ensuring .gitignore:', error);
      return false;
    }
  }

  /**
   * Checks if existing .gitignore contains essential patterns for the language
   * @param content Existing .gitignore content
   * @param language Detected project language
   * @returns True if essential patterns are present
   */
  private hasEssentialPatterns(content: string, language: ProjectLanguage): boolean {
    const essentialPatterns: Record<ProjectLanguage, string[]> = {
      rust: ['target/', 'target\\', '.gitorial/', '.vscode/', '.rust-analyzer/'],
      javascript: ['node_modules/', 'node_modules\\', '.gitorial/'],
      typescript: ['node_modules/', 'node_modules\\', 'dist/', 'dist\\', '.gitorial/'],
      python: ['__pycache__/', '__pycache__\\', '*.pyc', '.gitorial/'],
      go: ['*.exe', '*.out', '.gitorial/'],
      java: ['target/', 'target\\', '*.class', '.gitorial/'],
      csharp: ['bin/', 'bin\\', 'obj/', 'obj\\', '.gitorial/'],
      unknown: ['.gitorial/'],
    };

    const patterns = essentialPatterns[language];
    const lowercaseContent = content.toLowerCase();
    
    return patterns.some(pattern => 
      lowercaseContent.includes(pattern.toLowerCase())
    );
  }

  /**
   * Appends essential patterns to existing .gitignore
   * @param gitignorePath Path to .gitignore file
   * @param existingContent Current content
   * @param language Detected project language
   */
  private async appendEssentialPatterns(
    gitignorePath: string, 
    existingContent: string, 
    language: ProjectLanguage
  ): Promise<void> {
    const essentialPatterns: Record<ProjectLanguage, string[]> = {
      rust: [
        '',
        '# Essential Rust patterns added by Gitorial',
        'target/',
        'Cargo.lock',
        '.gitorial/',
        '.vscode/',
        '.rust-analyzer/',
        'rust-project.json',
      ],
      javascript: [
        '',
        '# Essential JavaScript patterns added by Gitorial',
        'node_modules/',
        'dist/',
        '.gitorial/',
        '.env',
      ],
      typescript: [
        '',
        '# Essential TypeScript patterns added by Gitorial',
        'node_modules/',
        'dist/',
        '.gitorial/',
        '*.tsbuildinfo',
        '.env',
      ],
      python: [
        '',
        '# Essential Python patterns added by Gitorial',
        '__pycache__/',
        '*.pyc',
        '.gitorial/',
        'venv/',
        '.env',
      ],
      go: [
        '',
        '# Essential Go patterns added by Gitorial',
        '*.exe',
        '*.out',
        '.gitorial/',
        'vendor/',
      ],
      java: [
        '',
        '# Essential Java patterns added by Gitorial',
        'target/',
        '*.class',
        '.gitorial/',
        '.gradle/',
      ],
      csharp: [
        '',
        '# Essential C# patterns added by Gitorial',
        'bin/',
        'obj/',
        '.gitorial/',
        '*.exe',
        '*.dll',
      ],
      unknown: [
        '',
        '# Essential Gitorial patterns',
        '.gitorial/',
      ],
    };

    const patterns = essentialPatterns[language];
    if (patterns.length === 0) return;

    const newContent = existingContent + '\n' + patterns.join('\n') + '\n';
    await this.fs.writeFile(gitignorePath, newContent);
  }

  /**
   * Gets the template content for a specific language
   * @param language Target language
   * @returns Template content or null if language not supported
   */
  public getTemplate(language: ProjectLanguage): string | null {
    if (language === 'unknown') return null;
    return GITIGNORE_TEMPLATES[language];
  }

  /**
   * Lists all supported languages
   * @returns Array of supported language keys
   */
  public getSupportedLanguages(): ProjectLanguage[] {
    return Object.keys(GITIGNORE_TEMPLATES) as ProjectLanguage[];
  }
}