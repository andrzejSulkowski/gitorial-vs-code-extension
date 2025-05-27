# Gitorial Development Guide

This comprehensive guide provides information for developers looking to contribute to or understand the Gitorial VS Code extension.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development Workflow](#development-workflow)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Data Flow Examples](#data-flow-examples)
- [Testing](#testing)
- [Debugging](#debugging)
- [Building and Packaging](#building-and-packaging)
- [Contributing Guidelines](#contributing-guidelines)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js** (v18 or higher) and **npm**
- **VS Code** (v1.87.0 or higher)
- **Git** (for cloning and testing with tutorial repositories)
- Basic understanding of TypeScript, VS Code extensions, and Clean Architecture

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/andrzejSulkowski/gitorial-vs-code-plugin.git
cd gitorial-vs-code-plugin/project

# 2. Install dependencies (both root and webview-ui)
npm install

# 3. Compile the extension
npm run compile

# 4. Open in VS Code
code .

# 5. Press F5 to run in Extension Development Host
# This opens a new VS Code window with the extension loaded
```

## Development Workflow

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run compile` | Full build: typecheck + webview + extension + post-build |
| `npm run typecheck` | TypeScript type checking without compilation |
| `npm run compile:webview` | Build the Svelte webview UI |
| `npm run compile:extension` | Build the extension backend using esbuild |
| `npm run lint` | Run ESLint on the source code |
| `npm run test` | Run all tests using VS Code test runner |
| `npm run test:unit` | Run unit tests with Mocha |
| `npm run vscode:package` | Package the extension as .vsix file |

### Development Loop

1. **Make changes** to TypeScript/Svelte code
2. **Compile**: Run `npm run compile` or use watch mode
3. **Test**: Press `F5` in VS Code to launch Extension Development Host
4. **Debug**: Use VS Code debugger or console logs
5. **Iterate**: Reload the Extension Development Host (`Ctrl+R`/`Cmd+R`)

### Watch Mode (Recommended)

For faster development, you can run components in watch mode:

```bash
# Terminal 1: Watch webview changes
cd webview-ui && npm run dev

# Terminal 2: Watch extension changes  
npm run compile:extension -- --watch

# Then press F5 in VS Code to start debugging
```

### Webview Development

The webview UI is a separate Svelte application with its own build process:

```bash
# Navigate to webview directory
cd webview-ui

# Install webview dependencies
npm install

# Development server with hot reload
npm run dev

# Production build
npm run build
```

**Key webview files:**
- `src/App.svelte`: Main Svelte component
- `src/lib/`: Reusable Svelte components
- `src/assets/`: Static assets (CSS, images)
- `public/`: Public assets served directly

## URI Commands and External Integration

The extension supports URI-based commands for external integration, allowing other applications or websites to trigger tutorial operations.

### Sync Command

The sync command allows external sources to open a specific tutorial at a particular commit state.

#### URI Schema

```
<IDE_NAME>://AndrzejSulkowski.gitorial/sync?platform=<platform>&creator=<creator>&repo=<repo>&commitHash=<commitHash>
```

#### Parameters

| Parameter | Description | Required | Supported Values |
|-----------|-------------|----------|------------------|
| `platform` | Git hosting platform | Yes | `github`, `gitlab` |
| `creator` | Repository owner/organization | Yes | Any valid username/org |
| `repo` | Repository name | Yes | Any valid repository name |
| `commitHash` | Specific commit to sync to | Yes | Full SHA commit hash |

#### Example URIs

```bash
# GitHub repository example
cursor://AndrzejSulkowski.gitorial/sync?platform=github&creator=shawntabrizi&repo=rust-state-machine&commitHash=b74e58d9b3165a2e18f11f0fead411a754386c75

# GitLab repository example  
cursor://AndrzejSulkowski.gitorial/sync?platform=gitlab&creator=myorg&repo=my-tutorial&commitHash=a1b2c3d4e5f6789012345678901234567890abcd
```

#### How It Works

1. **URI Registration**: Extension registers as a URI handler for the `cursor://AndrzejSulkowski.gitorial` scheme
2. **URI Parsing**: `UriParser` validates and extracts parameters from the URI
3. **Repository Construction**: Builds the full repository URL (e.g., `https://github.com/creator/repo`)
4. **Tutorial Processing**: Clones repository, checks out specified commit, and loads tutorial
5. **UI Display**: Opens tutorial in VS Code with the webview panel

#### Testing URI Commands

For development and testing, you can trigger URI commands programmatically:

```typescript
// In extension development
const uri = vscode.Uri.parse("cursor://AndrzejSulkowski.gitorial/sync?platform=github&creator=shawntabrizi&repo=rust-state-machine&commitHash=b74e58d9b3165a2e18f11f0fead411a754386c75");
const uriHandler = new TutorialUriHandler(controller);
await uriHandler.handleUri(uri);
```

#### URI Components

- **`CommandHandler.ts`**: Registers VS Code commands and handles the debug command
- **`UriHandler.ts`**: Implements `vscode.UriHandler` interface and processes incoming URIs
- **`UriParser.ts`**: Parses and validates URI structure and parameters
- **`TutorialController`**: Handles the actual tutorial operations triggered by URI commands

#### Error Handling

The URI system includes comprehensive error handling:

- **Invalid URI format**: Shows error message to user
- **Unsupported platform**: Validates against supported platforms list
- **Missing parameters**: Checks for required parameters
- **Repository access**: Handles Git clone and checkout failures
- **Tutorial loading**: Manages tutorial parsing and loading errors

## Architecture Overview

The extension follows **Clean Architecture** principles with clear separation of concerns across three main layers:

### 1. UI Layer (`src/ui/`, `webview-ui/`, `shared/types/viewmodels/`)

**Purpose**: Handles all user interface concerns and VS Code API interactions.

- **Controllers** (`src/ui/controllers/`): Orchestrate user actions and coordinate between domain services and UI services
  - `TutorialController.ts`: Main controller handling tutorial operations
- **Services** (`src/ui/services/`): Manage UI-specific operations
  - `TutorialViewService.ts`: Manages tutorial display, file views, and editor groups
  - `DiffViewService.ts`: Handles diff view generation and display
- **Panels** (`src/ui/panels/`): Manage VS Code webview panels
  - `TutorialPanelManager.ts`: Singleton manager for tutorial panels
  - `TutorialPanel.ts`: Individual webview panel instances
- **Handlers** (`src/ui/handlers/`): Process messages between webview and extension
  - `WebviewMessageHandler.ts`: Translates webview messages to controller actions
- **Ports** (`src/ui/ports/`): Interfaces for UI-specific abstractions
  - `IMarkdownConverter.ts`, `IGitChanges.ts`, etc.
- **ViewModels** (`src/ui/viewmodels/`): UI-specific data structures
- **Webview UI** (`webview-ui/`): Svelte application for the tutorial panel

### 2. Domain Layer (`src/domain/`)

**Purpose**: Contains core business logic, independent of UI or infrastructure concerns.

- **Models** (`src/domain/models/`): Core entities with minimal business logic
  - `Tutorial.ts`, `Step.ts`, `EnrichedStep.ts`, `StepState.ts`
- **Services** (`src/domain/services/`): Business logic and use cases
  - `TutorialService.ts`: Core tutorial operations
  - `StepProgressService.ts`: Step navigation and progress tracking
  - `TutorialBuilder.ts`: Constructs tutorial objects from Git repositories
- **Repositories** (`src/domain/repositories/`): Data persistence interfaces
  - `ITutorialRepository.ts`, `IStepStateRepository.ts`
- **Ports** (`src/domain/ports/`): External operation interfaces
  - `IGitOperations.ts`, `IFileSystem.ts`, `IUserInteraction.ts`

### 3. Infrastructure Layer (`src/infrastructure/`)

**Purpose**: Implements domain and UI ports, handles external systems and VS Code APIs.

- **Adapters** (`src/infrastructure/adapters/`): Concrete implementations of ports
  - Git adapters, file system adapters, VS Code API adapters
- **Repositories** (`src/infrastructure/repositories/`): Data persistence implementations
- **Factories** (`src/infrastructure/factories/`): Create infrastructure components
  - `GitAdapterFactory.ts`, `GitChangesFactory.ts`
- **State** (`src/infrastructure/state/`): Extension state management

### 4. Shared Layer (`shared/`)

**Purpose**: Types and utilities shared across layers.

- **Types** (`shared/types/`): TypeScript definitions
  - `viewmodels/`: Shared between extension backend and webview frontend
  - `domain-primitives/`: Basic reusable types


## Data Flow Examples

### Example 1: User Selects a Step in the Webview

1. **User Action**: User clicks "Next Step" in the webview
2. **Message Passing**: Svelte app posts message `{command: 'stepSelected', stepId: '...'}`
3. **Handler Processing**: `WebviewMessageHandler` receives and processes the message
4. **Controller Action**: Calls `TutorialController.requestPreviousStep()` or `TutorialController.requestNextStep()`
5. **Domain Update**: Controller updates step progress via domain services
6. **UI Refresh**: Controller calls `TutorialViewService.display(updatedTutorial)`
7. **View Management**: `TutorialViewService` updates file views and diff displays
8. **Panel Update**: Updates webview panel with new `TutorialViewModel`
9. **Frontend Render**: Svelte app receives updated data and re-renders UI

### Example 2: Opening an Existing Local Tutorial

1. **User Action**: Runs `Gitorial: Open Tutorial` command
2. **Command Handling**: `extension.ts` invokes `TutorialController.openLocalTutorial()`
3. **User Interaction**: Controller shows folder selection dialog via `IUserInteraction` port
4. **Domain Processing**: Controller calls `TutorialService.loadTutorialFromPath()`
5. **Data Loading**: Service uses `ITutorialRepository` and `IGitOperations` to build `Tutorial` object
6. **UI Update**: Controller calls `TutorialViewService.display()` to show tutorial and open files
7. **Panel Management**: `TutorialViewService` updates webview via `TutorialPanelManager`
8. **Frontend Rendering**: Svelte app receives `TutorialViewModel` and renders UI

### Example 3: URI-based Tutorial Sync

1. **External Trigger**: User clicks a URI link or extension receives URI via protocol handler
2. **URI Parsing**: `TutorialUriHandler` receives and parses the URI using `UriParser`
3. **Command Processing**: Handler identifies sync command and extracts repository information
4. **Controller Action**: Calls `TutorialController.handleExternalTutorialRequest()`
5. **Repository Operations**: Controller clones repository and checks out specific commit
6. **Tutorial Loading**: Loads tutorial from cloned repository
7. **UI Display**: Shows tutorial in webview and opens relevant files

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run unit tests only
npm run test:unit

# Run with coverage (if configured)
npm run test:unit -- --coverage
```

### Test Structure

- **Unit Tests**: Located alongside source files (`*.test.ts`)
- **Integration Tests**: In `src/test/` directory
- **Test Framework**: Mocha with Chai assertions
- **VS Code Testing**: Uses `@vscode/test-electron` for extension testing

### Writing Tests

```typescript
// Example unit test
import { expect } from 'chai';
import { TutorialService } from '../services/TutorialService';

describe('TutorialService', () => {
  it('should load tutorial from valid path', async () => {
    // Test implementation
  });
});
```

## Debugging

### Extension Debugging

1. **Set Breakpoints**: In VS Code, set breakpoints in your TypeScript code
2. **Launch Debugger**: Press `F5` to start Extension Development Host
3. **Trigger Code**: Perform actions that execute your code
4. **Debug**: Use VS Code's debugging features (variables, call stack, etc.)

### Webview Debugging

1. **Open Developer Tools**: In Extension Development Host, run `Developer: Open Webview Developer Tools`
2. **Debug Svelte**: Use browser dev tools to debug the Svelte application
3. **Message Debugging**: Log messages between webview and extension

### Logging

```typescript
// Extension logging
console.log('Debug info:', data);

// Webview logging (appears in webview dev tools)
console.log('Webview debug:', data);
```

## Building and Packaging

### Development Build

```bash
npm run compile
```

### Production Package

```bash
# Create .vsix package
npm run vscode:package

# The package will be created as gitorial-0.1.6.vsix
```

### Build Process

1. **TypeScript Compilation**: Checks types and compiles
2. **Webview Build**: Builds Svelte app with Vite
3. **Extension Bundle**: Creates optimized bundle with esbuild
4. **Post-build**: Copies assets and finalizes structure

## Contributing Guidelines

### Code Style

- Follow existing TypeScript and Svelte conventions
- Use ESLint configuration: `npm run lint`
- Prefer functional programming for utilities
- Use classes for domain models with behavior
- Follow Clean Architecture dependency rules

### Dependency Rules

- **UI Layer**: Can depend on Domain layer
- **Domain Layer**: Cannot depend on UI or Infrastructure
- **Infrastructure Layer**: Can depend on Domain layer
- **No circular dependencies** between layers

### Pull Request Process

1. **Fork** the repository
2. **Create feature branch**: `git checkout -b feature/your-feature`
3. **Make changes** following code style guidelines
4. **Add tests** for new functionality
5. **Run tests**: `npm run test`
6. **Lint code**: `npm run lint`
7. **Commit changes**: Use conventional commit messages
8. **Push branch**: `git push origin feature/your-feature`
9. **Create Pull Request** with clear description

## Troubleshooting

### Common Development Issues

**Extension not loading in Development Host**
- Check console for compilation errors
- Ensure `npm run compile` completed successfully
- Verify `package.json` contributions are correct

**Webview not displaying**
- Check webview build: `npm run compile:webview`
- Verify webview HTML and assets are generated
- Check browser console in webview dev tools

**TypeScript errors**
- Run `npm run typecheck` to see all type errors
- Ensure all dependencies are installed
- Check `tsconfig.json` configuration

**Git operations failing**
- Verify Git is installed and in PATH
- Check repository permissions
- Ensure test repositories are valid Git repos

### Performance Considerations

- **Lazy Loading**: Load heavy operations only when needed
- **Debouncing**: Debounce frequent operations like file watching
- **Memory Management**: Dispose of VS Code resources properly
- **Bundle Size**: Monitor extension bundle size

### Getting Help

- 📖 [VS Code Extension API](https://code.visualstudio.com/api)
- 🏗️ [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- 🎯 [Svelte Documentation](https://svelte.dev/docs)
- 💬 [Project Issues](https://github.com/andrzejSulkowski/gitorial-vs-code-plugin/issues)

---

This architecture promotes maintainability, testability, and scalability while keeping the codebase organized and easy to understand. 