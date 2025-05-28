# Architecture Improvement Plan

## 🎯 **Priority 1: Service Layer Refactoring**

### **1.1 Split TutorialViewService (431 lines)**

**Current Issues:**
- Handles webview management, diff display, tab tracking, and file operations
- Violates Single Responsibility Principle
- Hard to test and maintain

**Proposed Split:**
```
src/ui/services/
├── TutorialViewService.ts          # Core view orchestration (100-150 lines)
├── WebviewPanelService.ts          # Webview panel management
├── EditorLayoutService.ts          # Tab/editor group management
├── FileDisplayService.ts           # File opening/closing logic
└── ViewModelService.ts             # ViewModel creation/transformation
```

### **1.2 Refactor TutorialController (530 lines)**

**Current Issues:**
- Handles cloning, loading, navigation, and UI coordination
- Too many dependencies (7 constructor parameters)
- Mixed concerns

**Proposed Split:**
```
src/ui/controllers/
├── TutorialController.ts           # Core orchestration (200-250 lines)
├── TutorialCloneController.ts      # Repository cloning logic
├── TutorialLoadController.ts       # Tutorial loading/detection
└── TutorialNavigationController.ts # Step navigation logic
```

### **1.3 Domain Service Optimization**

**TutorialService.ts (394 lines)** - Split into:
```
src/domain/services/
├── TutorialService.ts              # Core tutorial operations
├── TutorialNavigationService.ts    # Step navigation logic
├── TutorialStateService.ts         # State persistence
└── TutorialValidationService.ts    # Tutorial validation
```

## 🎯 **Priority 2: Testing Architecture**

### **2.1 Current Testing Issues**
- Only one large integration test file (707 lines)
- No unit tests for individual services/components
- Testing logic mixed with implementation details

### **2.2 Proposed Testing Structure**
```
src/test/
├── unit/
│   ├── domain/
│   │   ├── services/
│   │   │   ├── TutorialService.test.ts
│   │   │   ├── TutorialNavigationService.test.ts
│   │   │   └── TutorialSyncService.test.ts
│   │   └── models/
│   │       ├── Tutorial.test.ts
│   │       └── Step.test.ts
│   ├── ui/
│   │   ├── controllers/
│   │   │   └── TutorialController.test.ts
│   │   └── services/
│   │       ├── TutorialViewService.test.ts
│   │       └── DiffViewService.test.ts
│   └── infrastructure/
│       ├── adapters/
│       │   ├── GitAdapter.test.ts
│       │   └── MarkdownConverter.test.ts
│       └── repositories/
│           └── TutorialRepositoryImpl.test.ts
├── integration/
│   ├── extension.test.ts           # Reduced scope
│   ├── tutorial-workflow.test.ts   # End-to-end workflows
│   └── webview-communication.test.ts
└── fixtures/
    ├── mock-tutorials/
    └── test-data/
```

## 🎯 **Priority 3: Dependency Management**

### **3.1 Current Issues**
- Complex dependency graph in `extension.ts`
- Manual dependency injection
- Hard to mock for testing

### **3.2 Proposed Solution: Dependency Container**
```typescript
// src/infrastructure/di/Container.ts
export class Container {
  private services = new Map<string, any>();
  
  register<T>(key: string, factory: () => T): void {
    this.services.set(key, factory);
  }
  
  resolve<T>(key: string): T {
    const factory = this.services.get(key);
    if (!factory) throw new Error(`Service ${key} not registered`);
    return factory();
  }
}

// src/infrastructure/di/ServiceRegistry.ts
export function registerServices(container: Container, context: vscode.ExtensionContext) {
  // Infrastructure
  container.register('fileSystem', () => createFileSystemAdapter());
  container.register('gitOperationsFactory', () => new GitOperationsFactory());
  
  // Domain
  container.register('tutorialService', () => new TutorialService(
    container.resolve('tutorialRepository'),
    container.resolve('gitOperationsFactory'),
    // ...
  ));
  
  // UI
  container.register('tutorialController', () => new TutorialController(
    container.resolve('tutorialService'),
    container.resolve('tutorialViewService'),
    // ...
  ));
}
```

## 🎯 **Priority 4: Error Handling & Logging**

### **4.1 Current Issues**
- Inconsistent error handling patterns
- Console.log scattered throughout
- No centralized logging strategy

### **4.2 Proposed Solution**
```
src/infrastructure/logging/
├── Logger.ts                       # Centralized logging interface
├── VSCodeLogger.ts                 # VS Code output channel implementation
└── LogLevel.ts                     # Log level definitions

src/domain/errors/
├── TutorialError.ts                # Base tutorial error
├── GitOperationError.ts            # Git-specific errors
└── ValidationError.ts              # Validation errors
```

## 🎯 **Priority 5: Configuration Management**

### **5.1 Current Issues**
- Configuration scattered across services
- No centralized settings management
- Hard to test with different configurations

### **5.2 Proposed Solution**
```
src/infrastructure/config/
├── ConfigurationService.ts         # Centralized config access
├── DefaultSettings.ts              # Default values
└── SettingsValidator.ts            # Settings validation

src/domain/ports/
└── IConfigurationService.ts        # Domain interface
```

## 🎯 **Priority 6: Event System**

### **6.1 Current Issues**
- Tight coupling between services
- Direct method calls for notifications
- Hard to extend with new features

### **6.2 Proposed Solution**
```
src/domain/events/
├── EventBus.ts                     # Central event dispatcher
├── TutorialEvents.ts               # Tutorial-specific events
└── EventHandler.ts                 # Base event handler

// Example events:
- TutorialLoadedEvent
- StepChangedEvent
- SolutionToggledEvent
- SyncStateChangedEvent
```

## 🎯 **Priority 7: Performance Optimizations**

### **7.1 Lazy Loading**
- Load tutorial content on-demand
- Defer heavy operations until needed
- Implement caching for frequently accessed data

### **7.2 Memory Management**
- Proper disposal of resources
- Weak references where appropriate
- Clear unused tutorial data

## 🎯 **Priority 8: Documentation Architecture**

### **8.1 Proposed Structure**
```
docs/
├── architecture/
│   ├── clean-architecture.md       # Architecture overview
│   ├── dependency-flow.md          # Dependency diagrams
│   └── service-responsibilities.md # Service boundaries
├── development/
│   ├── setup.md                    # Development setup
│   ├── testing.md                  # Testing guidelines
│   └── debugging.md                # Debugging guide
└── api/
    ├── domain-services.md          # Domain service APIs
    ├── ui-services.md              # UI service APIs
    └── infrastructure-adapters.md  # Infrastructure APIs
```

## 📋 **Implementation Roadmap**

### **Phase 1 (Week 1-2): Foundation**
1. Set up proper testing structure
2. Implement dependency container
3. Add centralized logging

### **Phase 2 (Week 3-4): Service Refactoring**
1. Split TutorialViewService
2. Refactor TutorialController
3. Add unit tests for new services

### **Phase 3 (Week 5-6): Error Handling & Events**
1. Implement error handling system
2. Add event bus
3. Improve configuration management

### **Phase 4 (Week 7-8): Performance & Documentation**
1. Implement lazy loading
2. Add performance monitoring
3. Complete documentation

## 🎯 **Immediate Quick Wins**

1. **Extract ViewModelService** from TutorialViewService
2. **Add unit tests** for core domain services
3. **Implement proper error types** instead of generic Error
4. **Add JSDoc comments** to all public methods
5. **Create service interfaces** for better testability 