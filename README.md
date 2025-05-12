# Gitorial

![Version](https://img.shields.io/badge/version-0.1.3--alpha-yellow)
![Status](https://img.shields.io/badge/status-experimental-orange)

A VS Code extension that enables interactive, step-by-step, [Gitorial-based](https://github.com/gitorial-sdk) gitorials directly in your editor.

## Table of Contents

- [Features](#features)
- [How to Use](#how-to-use)
- [For Tutorial Users](#for-tutorial-users)
- [For Tutorial Authors](#for-tutorial-authors)
- [Development](#development)
- [Project Structure](#project-structure)
- [Commands](#commands)
- [License](#license)

## Features

- Clone gitorial repositories
- Navigate through structured step-by-step gitorials
- Rich Markdown content for each gitorial step
- Persistent state that remembers your progress
- Easily follow coding lessons at your own pace

## How to Use

### For Tutorial Users

1. **Clone a New Gitorial**
    - Open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
    - Run the command `Gitorial: Clone New Tutorial`.
    - Enter the Git URL of the gitorial repository.
    - Select a **parent directory** where the gitorial folder will be created.
    - The extension clones the repository into a new sub-folder.
    - A **new VS Code window** automatically opens with the cloned gitorial folder.
    - The Gitorial panel should load automatically in the new window thanks to the activation logic.

2. **Open an Existing Gitorial**
    - Open a folder containing a Gitorial project in VS Code (e.g., using `File > Open Folder...`).
    - Once the folder is open, the Gitorial extension will activate automatically.
    - It will detect the Gitorial and show an **information prompt**: `Gitorial '[Tutorial Title]' detected in this workspace. Load it?`
    - Click **"Load Gitorial"** on the prompt to open the tutorial panel.
    - (Alternatively) If you miss the prompt or want to open it later, use the command `Gitorial: Open Tutorial` and select **"Use Current Workspace"**.
    - **Opening via Command Palette:** If you run `Gitorial: Open Tutorial` without a Gitorial workspace open, you can choose **"Select Directory"**. Selecting a directory will open it in VS Code, triggering the automatic detection and prompt described above.

3. **Using the Gitorial Panel**
    - Once the panel is open, follow the instructions provided in the content area.
    - Use the **"Next"**, **"Back"**, and **"Solution"** buttons in the bottom bar to navigate through the steps and view solutions.

### For Tutorial Authors

Take a look at the official documentation [here](https://github.com/gitorial-sdk)

## Development

### Prerequisites

- Node.js and npm
- VS Code

### Setup

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to transpile the code
4. Open the project in VS Code
5. Press `F5` _(or open via command palette: `Debug: Start Debugging`)_ to run the extension in a development host
6. Press `F5` again and run the extensions commands found under `Gitorial:*`

### How It Works

The extension:

1. Clones the gitorial repository (if needed) or uses a local one.
2. Uses `TutorialBuilder` to load gitorial steps and metadata from the repository (based on commit history).
3. Creates a `Tutorial` instance to hold the loaded gitorial data and manage the current step state.
4. Creates a `TutorialController` to manage the active gitorial session state (like showing/hiding solutions) and orchestrate UI actions (layout changes, file reveals).
5. Creates a `TutorialPanel` which renders the Svelte-based webview UI.
6. The `TutorialPanel` acts as a bridge, forwarding user actions (Next, Prev, Show Solution) from the webview to the `TutorialController`.
7. The `TutorialController` processes actions, updates the `Tutorial` state, interacts with `GitService` and VS Code APIs (for checkouts, diffs, file display, layout changes), and then sends simplified view data back to the `TutorialPanel`.
8. The `TutorialPanel` sends this data to the Svelte webview for rendering.
9. Progress (current step) is persisted via the `Tutorial` instance.

### Project Structure

- `src/`
  - `extension.ts` - Extension activation, command registration, main entry point.
  - `controllers/`
    - `TutorialController.ts` - Manages active gitorial session, state, UI logic, communication.
  - `panels/`
    - `TutorialPanel.ts` - Manages the webview panel lifecycle and communication bridge.
  - `services/`
    - `tutorial.ts` - (`TutorialBuilder`, `Tutorial`) Loads tutorial data, holds step state, manages git interaction for steps.
    - `step.ts` - (`StepService`) Loads tutorial steps and manages step content updates (reads and renders markdown, persists state).
    - `git.ts` - (`GitService`) Encapsulates all Git commands.
  - `utilities/` - Helper functions (e.g., `getNonce`).

## Commands

- `Gitorial: Clone New Tutorial` (`gitorial.cloneTutorial`): Clone a new tutorial repository into a selected folder and open it in a new window.
- `Gitorial: Open Tutorial` (`gitorial.openTutorial`): Open or load an existing tutorial in the current workspace.

## License

MIT
