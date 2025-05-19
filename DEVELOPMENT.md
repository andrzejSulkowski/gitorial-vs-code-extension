# Gitorial Development Guide

This guide provides information for developers looking to contribute to or understand the Gitorial VS Code extension.

## Prerequisites

- Node.js and npm
- VS Code

## Setup

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run compile` to transpile the code (or `npm run watch` for continuous compilation during development).
4. Open the project in VS Code.
5. Press `F5` (or open via command palette: `Debug: Start Debugging`) to run the extension in a new Extension Development Host window.

## How It Works (Architecture Overview)

The extension follows a Clean Architecture pattern, broadly separated into UI, Domain, and Infrastructure layers.

1.  **Extension Activation (`extension.ts`)**: 
    *   This is the main entry point when the extension is activated by VS Code.
    *   It's responsible for the initial setup (Composition Root): instantiating controllers, domain services, infrastructure adapters, and repositories.
    *   It registers VS Code commands and associates them with controller actions.

2.  **UI Layer (`src/ui/`, `webview-ui/`)**:
    *   **`TutorialController.ts`**: Orchestrates UI-related logic, user interactions (prompts, diffs), and prepares data (ViewModels) for the views. It receives actions from VS Code commands or the webview.
    *   **`TutorialPanelManager.ts` & `TutorialPanel.ts`**: Manage the lifecycle of the tutorial webview panel. `TutorialPanelManager` ensures only one panel is active and `TutorialPanel` handles the specific webview instance, its content, and basic message passing.
    *   **`WebviewMessageHandler.ts`**: Processes messages received *from* the webview and translates them into calls on the `TutorialController`.
    *   **`webview-ui/`**: Contains the Svelte application that renders the actual tutorial content and navigation controls within the webview panel.

3.  **Domain Layer (`src/domain/`)**:
    *   **Models (`Tutorial.ts`, `Step.ts`, `StepState.ts`)**: Represent the core entities and their state. They are plain objects with no knowledge of UI or infrastructure.
    *   **Services (`TutorialService.ts`, `StepProgressService.ts`, `TutorialBuilder.ts`)**: Encapsulate the core business logic, rules, and use cases of the application (e.g., loading tutorial data, managing step progression). They operate on domain models and use ports to interact with external concerns.
    *   **Repositories (Interfaces/Ports like `ITutorialRepository.ts`, `IStepStateRepository.ts`)**: Define contracts for data persistence. Implementations are in the Infrastructure layer.
    *   **Ports (Interfaces like `IGitOperations.ts`, `IDiffDisplayer.ts`, `IUserInteraction.ts`, `IFileSystem.ts`)**: Define contracts for external operations (Git, showing diffs, user prompts, file system access). Implementations are in the Infrastructure layer.

4.  **Infrastructure Layer (`src/infrastructure/`)**:
    *   **Adapters**: Concrete implementations of the domain ports. For example:
        *   `GitAdapter.ts` (implementing `IGitOperations`) would use a library like `simple-git`.
        *   VS Code specific adapters for `IUserInteraction`, `IDiffDisplayer`, etc., using `vscode` API.
    *   **Factories (`GitAdapterFactory.ts`)**: Used to create instances of adapters, potentially based on context (e.g., workspace path).
    *   **Repositories**: Concrete implementations of the domain repositories.
        *   `TutorialRepositoryImpl.ts` (implementing `ITutorialRepository`)

### Data Flow Example 1: User selects a step in the webview

*   Svelte UI in webview sends a message (e.g., `{ command: 'stepSelected', stepId: '...' }`).
*   `TutorialPanel` receives the message and passes it to `WebviewMessageHandler`.
*   `WebviewMessageHandler` interprets the command and calls `tutorialController.selectStep(stepId)`.
*   `TutorialController.selectStep(stepId)`:
    *   Validates the request.
    *   Calls `stepProgressService.setCurrentStep(tutorialId, stepId)` to persist the new active step (Domain Service interaction).
    *   Calls the `IGitOperations` adapter (via `this.activeGitAdapter`) to checkout the corresponding commit.
    *   Updates its internal state (e.g., `activeTutorial.currentStepId`).
    *   Prepares a new `TutorialViewModel`.
    *   Calls `TutorialPanelManager.createOrShow(...)` which updates the `TutorialPanel` with the new view model.
*   `TutorialPanel` sends the updated view model to the Svelte app, which re-renders the UI.

### Data Flow Example 2: Opening an Existing Local Gitorial via Command

1.  **User Action (VS Code UI)**:
    *   User opens the Command Palette (`Cmd+Shift+P`).
    *   User runs the command `Gitorial: Open Tutorial`.

2.  **Extension Activation & Command Handling (`extension.ts` - UI Layer / Composition Root)**:
    *   If the extension isn't already active, VS Code activates it, running the `activate` function in `extension.ts`.
    *   The `activate` function has already registered the command `gitorial.openTutorial` and associated it with a handler, which is typically a method on an instance of `TutorialController` (e.g., `tutorialController.initiateOpenLocalTutorial()`).
    *   The command handler `tutorialController.initiateOpenLocalTutorial()` is executed.

3.  **`TutorialController.initiateOpenLocalTutorial()` (UI Layer - `src/ui/controllers/`)**:
    *   This method is responsible for orchestrating the process of opening a local tutorial.
    *   **User Interaction (Infrastructure Layer via Port)**: It uses an injected `IUserInteraction` adapter (e.g., `VsCodeUserInteractionAdapter`) to show an open dialog to the user, asking them to select a folder (`this.userInteraction.showOpenDialog(...)`).
    *   **Path Received**: The controller receives the selected folder path (e.g., `/path/to/gitorial-folder`).

4.  **Controller Delegates to Domain Service (UI Layer -> Domain Layer)**:
    *   The `TutorialController` now needs to load the tutorial data from this path. It calls a method on an injected instance of a domain service, for example, `this.tutorialService.loadTutorialFromPath(folderPath)`.

5.  **`TutorialService.loadTutorialFromPath(folderPath)` (Domain Layer - `src/domain/services/`)**:
    *   This service method contains the core business logic for loading a tutorial from a file path.
    *   **Repository Interaction (Domain Layer Port)**: It uses an injected `ITutorialRepository` (e.g., `FileSystemTutorialRepository` which implements the interface) to find and load tutorial metadata from the given `folderPath` (`this.repository.findByPath(folderPath)`).
    *   **Git Operations (Domain Layer Port)**: If tutorial metadata is found, the `TutorialService` (or the `TutorialBuilder` it uses) might need to interact with the Git repository to fetch commit history to build the steps. It would use an injected `IGitOperations` adapter. The `Tutorial` object is constructed, potentially using `TutorialBuilder.buildFromLocalPath()`, which internally uses the `IGitOperations` adapter to get commit history.
    *   **Returns `Tutorial` Object**: The `TutorialService` returns the fully populated `Tutorial` domain model object (or `null` if not found/failed).

6.  **`TutorialController` Receives `Tutorial` Object (Domain Layer -> UI Layer)**:
    *   The `TutorialController.initiateOpenLocalTutorial()` method receives the `Tutorial` object from `TutorialService`.
    *   **State Management**: It sets `this.activeTutorial = tutorial;`. It also ensures `this.activeGitAdapter` is set for the active tutorial's path.
    *   **UI Update Preparation**: It prepares a `TutorialViewModel` based on the `activeTutorial`.
    *   **Display Panel (UI Layer)**: It calls `TutorialPanelManager.createOrShow(this.context.extensionUri, tutorialViewModel, this)` to display the tutorial in the webview panel.
    *   **VS Code Context (UI Layer)**: It might set a VS Code context flag like `vscode.commands.executeCommand('setContext', 'gitorial.tutorialActive', true);`.
    *   **User Notification (Infrastructure Layer via Port)**: It might use `this.userInteraction.showInformationMessage(...)` to notify the user that the tutorial is loaded.

7.  **`TutorialPanelManager` & `TutorialPanel` (UI Layer - `src/ui/panels/`)**:
    *   `TutorialPanelManager.createOrShow()` either creates a new `TutorialPanel` instance or updates an existing one.
    *   The `TutorialPanel` receives the `TutorialViewModel`.
    *   It updates its webview's HTML content or posts a message to the Svelte app within the webview with the new `TutorialViewModel`.

8.  **Svelte App in Webview (UI Layer - `webview-ui/`)**:
    *   The Svelte app receives the new `TutorialViewModel`.
    *   It re-renders the UI to display the tutorial steps, content for the current step, navigation buttons, etc.

**Layer Activation Summary for "Open Local Gitorial":**

*   **VS Code UI**: User initiates the command.
*   **`extension.ts` (UI Layer - Composition Root)**: Command handler invoked.
*   **`TutorialController` (UI Layer)**: Orchestrates, uses `IUserInteraction`.
*   **`TutorialService` (Domain Layer)**: Core loading logic, uses `ITutorialRepository`, `IGitOperations` (via injected adapter), `TutorialBuilder`.
*   **`ITutorialRepository` / `IGitOperations` (Domain Ports)**: Interfaces used by `TutorialService`.
*   **`FileSystemTutorialRepository` / `GitAdapter` (Infrastructure Layer - Adapters)**: Concrete implementations of the ports, performing actual file system/Git operations.
*   **`Tutorial` / `Step` (Domain Models)**: Data returned from `TutorialService` to `TutorialController`.
*   **`TutorialViewModel` (UI Layer - ViewModel)**: Prepared by `TutorialController`.
*   **`TutorialPanelManager` / `TutorialPanel` (UI Layer)**: Display the view model in the webview.
*   **Svelte App (UI Layer - Webview)**: Renders the final UI.

## Project Structure Overview

-   **`.vscode/`**: VS Code specific settings, launch configurations for debugging.
-   **`media/`** (if you have static images/icons for README or extension description)
-   **`webview-ui/`**: Contains the Svelte (or other framework) source code for the webview panel UI.
    -   `src/`: Svelte components, stores, etc.
    -   `public/`: Static assets for the webview.
    -   `dist/` or `build/`: Compiled output of the webview UI.
-   **`src/`**: Main TypeScript source code for the extension.
    -   **`extension.ts`**: The primary entry point for the VS Code extension. Handles activation, command registration, and initial setup (composition root).
    -   **`ui/`**: UI layer components.
        -   `controllers/`: Controllers like `TutorialController` that handle UI logic and mediate between user actions and the domain.
        -   `panels/`: Manages VS Code WebviewPanels (e.g., `TutorialPanelManager`, `TutorialPanel`).
        -   `handlers/`: Message handlers like `WebviewMessageHandler`.
        -   `viewmodels/`: View-specific data structures (`TutorialViewModel`).
    -   **`domain/`**: Core domain logic, independent of VS Code or specific frameworks.
        -   `models/`: Domain entities (e.g., `Tutorial`, `Step`).
        -   `services/`: Domain services containing business logic (e.g., `TutorialService`, `StepProgressService`, `TutorialBuilder`).
        -   `repositories/`: Interfaces for data persistence (e.g., `ITutorialRepository`).
        -   `ports/`: Interfaces for other external concerns (e.g., `IGitOperations`, `IUserInteraction`).
        -   `events/`: Domain event definitions and event bus.
    -   **`infrastructure/`**: Implementations of domain ports, interacting with external systems.
        -   `adapters/`: Concrete implementations of ports (e.g., Git adapter, file system adapter, VS Code API adapters).
        -   `repositories/`: Concrete repository implementations (e.g., for storing tutorial state).
        -   `factories/`: Factories for creating infrastructure components.
        -   `state/`: May contain specific logic for managing extension state if not covered by repositories (e.g., VS Code `Memento` based storage).
    -   **`libs/`**: Utility libraries or self-contained modules (e.g., `uri-parser`).
    -   **`utilities/`**: General helper functions used across the extension.
-   **`package.json`**: Defines extension metadata, contributions (commands, views), dependencies, and scripts.
-   **`tsconfig.json`**: TypeScript compiler configuration.
-   **`.eslintrc.js`, `.prettierrc.js`** (or similar): Linting and code formatting configurations.

This structure aims to follow Clean Architecture principles, promoting separation of concerns, testability, and maintainability. 