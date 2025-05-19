# Gitorial

![Version](https://img.shields.io/badge/version-0.1.4--alpha-yellow)
![Status](https://img.shields.io/badge/status-experimental-orange)

A VS Code extension that enables interactive, step-by-step, [Gitorial-based](https://github.com/gitorial-sdk) tutorials directly in your editor.

## Table of Contents

- [Features](#features)
- [How to Use](#how-to-use)
  - [For Tutorial Users](#for-tutorial-users)
  - [For Tutorial Authors](#for-tutorial-authors)
- [Development](#development)
- [Commands](#commands)
- [License](#license)

## Features

- Clone tutorial repositories.
- Navigate through structured step-by-step tutorials.
- View rich Markdown content for each tutorial step.
- Persistent state that remembers your progress across sessions.
- Easily follow coding lessons at your own pace within the editor.

## How to Use

### For Tutorial Users

1.  **Clone a New Tutorial**
    *   Open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
    *   Run the command `Gitorial: Clone New Tutorial`.
    *   Enter the Git URL of the tutorial repository.
    *   Select a **parent directory** where the tutorial folder will be created.
    *   The extension clones the repository into a new sub-folder named after the repository.
    *   A **new VS Code window** should automatically open with the cloned tutorial folder. (If not, open the cloned folder manually).
    *   The Gitorial panel should load automatically in the new window if the tutorial is detected.

2.  **Open an Existing Local Tutorial**
    *   Open a folder containing a Gitorial project in VS Code (e.g., using `File > Open Folder...`).
    *   Once the folder is open, the Gitorial extension will activate.
    *   It should detect the Gitorial and may show an **information prompt** (e.g., `Gitorial '[Tutorial Title]' detected. Load it?`).
    *   Click **"Load Tutorial"** (or similar) on the prompt to open the tutorial panel.
    *   If you miss the prompt or want to open it later, use the command `Gitorial: Open Tutorial` and select **"Use Current Workspace"** (if the workspace is the tutorial root) or **"Select Directory..."** to browse to the tutorial folder. If you select a directory, it will typically open in a new VS Code window, triggering detection.

3.  **Using the Gitorial Panel**
    *   Once the panel is open, the tutorial content for the current step is displayed.
    *   Use the **"Next"**, **"Previous"** (or "Back") buttons to navigate through the steps.
    *   A **"Show Solution"** button may be available to display the differences for the current step.

### For Tutorial Authors

For information on creating Gitorial-compatible tutorials, please refer to the official [Gitorial SDK documentation](https://github.com/gitorial-sdk).

_🏗️ In an upcoming version the extension will support the creation of new Gitorials from within the extension._

## Development

For details on how to set up the development environment, understand the project architecture, and contribute to the extension, please see the [Gitorial Development Guide](./DEVELOPMENT.md).

## Commands

-   `Gitorial: Clone New Tutorial` (`gitorial.cloneTutorial`): Clones a new tutorial repository into a selected parent folder and attempts to open it.
-   `Gitorial: Open Tutorial` (`gitorial.openTutorial`): Allows opening an existing local tutorial, either from the current workspace or by selecting a directory.

## License

MIT
