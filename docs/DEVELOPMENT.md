# Gitorial Development Guide

Quick guide for developers contributing to the Gitorial VS Code extension.

## Quick Start

```bash
# 1. Setup
git clone https://github.com/andrzejSulkowski/gitorial-vs-code-extension.git
cd gitorial-vs-code-extension
pnpm install

# 2. Key Commands
pnpm run build      # Build everything
pnpm run test       # Run all tests
pnpm run lint       # Check code style
pnpm run package    # Create .vsix package
```

**Prerequisites**: Node.js v20+, pnpm v10+, VS Code v1.87+, Git

## Architecture Overview

**Clean Architecture** with three layers and clear dependency direction (UI → Domain ← Infrastructure):

### 1. UI Layer (`src/ui/`, `webview-ui/`, `packages/shared-types/src/ui/`)

**Purpose**: Orchestrates user interactions between VS Code APIs and domain services.

**Key Modules**:

- **Tutorial** (`src/ui/tutorial/`): Modular controller pattern - lifecycle, navigation, webview, editor management
- **Webview** (`src/ui/webview/`): Panel management and extension-webview communication
- **System** (`src/ui/system/`): Extension-wide operations and global commands
- **Frontend** (`webview-ui/`): Svelte-based tutorial interface with reactive state management
- **Shared Types** (`packages/shared-types/src/ui/`): Shared types between extension and webview

**Common Tasks**:

- Add tutorial step behavior → `src/ui/tutorial/controller/navigation.ts`
- Modify webview interface → `webview-ui/src/lib/components/`
- Add new commands → `src/ui/tutorial/CommandHandler.ts`

### 2. Domain Layer (`src/domain/`)

**Purpose**: Core business logic, independent of UI/infrastructure.

**Key Modules**:

- **Models**: `Tutorial`, `Step`, `EnrichedStep` (core entities)
- **Services**: `TutorialService`, `TutorialBuilder`, `DiffService` (business logic)
- **Repositories**: `ITutorialRepository`, `IActiveTutorialStateRepository` (data interfaces)
- **Ports**: `IGitOperations`, `IFileSystem`, `IUserInteraction` (external interfaces)

**Common Tasks**:

- Add business logic → `src/domain/services/`
- Modify tutorial structure → `src/domain/models/`
- Add external dependencies → `src/domain/ports/`

### 3. Infrastructure Layer (`src/infrastructure/`)

**Purpose**: Implements domain ports, handles VS Code APIs and external systems.

**Key Modules**:

- **Adapters**: Concrete implementations of domain ports
- **Repositories**: Data persistence implementations
- **Factories**: Component creation and dependency injection
- **State**: Extension state management

**Common Tasks**:

- Add VS Code integration → `src/infrastructure/adapters/`
- Implement data persistence → `src/infrastructure/repositories/`
- Add external service → `src/infrastructure/adapters/`

## Key Workflows

### Adding a New Tutorial Feature

1. **Define the interface** in `src/domain/ports/`
2. **Add business logic** in `src/domain/services/`
3. **Implement adapter** in `src/infrastructure/adapters/`
4. **Wire up UI** in `src/ui/tutorial/controller/`
5. **Update frontend** in `webview-ui/src/lib/components/`

### Debugging Common Issues

- **Extension not loading**: Check `pnpm run build` output and console errors
- **Webview not displaying**: Open webview dev tools (`Developer: Open Webview Developer Tools`)
- **TypeScript errors**: Run `pnpm run typecheck` for detailed errors

## URI Integration

Support for external tutorial launching via URI protocol:

```
<IDE_NAME>://AndrzejSulkowski.gitorial/sync?platform=github&creator=user&repo=tutorial&commitHash=abc123
```

**Implementation**: `src/ui/deep-link/UriHandler.ts`

## Development Patterns

### Message-Driven Communication

Webview ↔ Extension communication uses strongly-typed messages:

- **Messages**: `packages/shared-types/src/ui/messages/`
- **ViewModels**: `packages/shared-types/src/ui/viewmodels/`
- **Handler**: `src/ui/webview/WebviewMessageHandler.ts`

### Modular Controllers

Tutorial controller split by responsibility:

- `lifecycle.ts`: Loading, initialization, cleanup
- `navigation.ts`: Step navigation and progress
- `webview.ts`: Panel management
- `editor.ts`: VS Code editor integration

### Resource Management

Dedicated managers:

- `EditorManager`: VS Code editor tabs and diff views
- `WebviewPanelManager`: Webview panel lifecycle
- `TabTrackingService`: Open tab tracking

## Testing

```bash
pnpm run test        # All tests + linting
pnpm run test:unit   # Unit tests only
```

**Structure**:

- Unit tests alongside source files (`*.test.ts`)
- Integration tests in `src/test/`
- Framework: Mocha + Chai

## Building & Packaging

```bash
pnpm run build      # Production build
pnpm run package    # Create .vsix file
```

**Process**: TypeScript compilation → Webview build (Vite) → Extension bundle (esbuild)

## Contributing

### Code Style

- Follow existing TypeScript/Svelte conventions
- Use `pnpm run lint` for style checking
- Follow Clean Architecture dependency rules

### Dependency Rules

- **UI Layer**: Can depend on Domain
- **Domain Layer**: Cannot depend on UI or Infrastructure
- **Infrastructure Layer**: Can depend on Domain

### Pull Request Process

1. Fork repository and create feature branch
2. Make changes following code style
3. Add tests for new functionality
4. Run `pnpm run test` and `pnpm run lint`
5. Create PR with clear description

## Educational Content Detection

The extension automatically opens files containing these keywords:

- `TODO:`, `FIXME:`, `unimplemented!()`, `todo!()`, `???`
- `/* ... implement ... */`

**Implementation**: `src/domain/services/DiffService.ts` (EDUCATIONAL_PATTERNS)

## Performance Considerations

- **Lazy Loading**: Load heavy operations only when needed
- **Debouncing**: Debounce frequent operations like file watching
- **Memory Management**: Dispose VS Code resources properly
- **Bundle Size**: Monitor extension bundle size

## Resources

- 📖 [VS Code Extension API](https://code.visualstudio.com/api)
- 🏗️ [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- 🎯 [Svelte Documentation](https://svelte.dev/docs)
- 💬 [Project Issues](https://github.com/andrzejSulkowski/gitorial-vs-code-plugin/issues)

---

This architecture aims to promote maintainability, testability, and scalability while keeping the codebase organized and easy to understand.
