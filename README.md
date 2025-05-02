# VS Code Extension - Gitorial 
**(🚧 Currently Under Development 🚧)A**

A VS Code extension that enables interactive, step-by-step, [Gitorial-based](https://github.com/gitorial-sdk) tutorials directly in your editor.

## Features

- Clone tutorial repositories with a simple command
- Navigate through structured step-by-step tutorials
- Rich Markdown content for each tutorial step
- Persistent state that remembers your progress
- Easily follow coding lessons at your own pace

## How to Use

### For Tutorial Users

1. **Clone a Tutorial**
   - Open the command palette with `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Run the command `Gitorial: Clone New Tutorial`
   - Enter the Git URL of a tutorial repository (or use the default example)
   - Select a folder to clone the tutorial into

2. **Open a Tutorial**
   - Run the command `Gitorial: Open Tutorial` from the command palette
   - Select from your available tutorials
   - Follow the instructions in the tutorial webview panel
   - Use the "Next" and "Back" buttons to navigate through tutorial steps

### For Tutorial Authors
Take a look at the official documentation [here](https://github.com/gitorial-sdk)

## How It Works

The extension:
1. Clones the tutorial repository (if needed) or uses a local one.
2. Uses `TutorialBuilder` to load tutorial steps and metadata from the repository (based on commit history).
3. Creates a `Tutorial` instance to hold the loaded tutorial data and manage the current step state.
4. Creates a `TutorialController` to manage the active tutorial session state (like showing/hiding solutions) and orchestrate UI actions (layout changes, file reveals).
5. Creates a `TutorialPanel` which renders the Svelte-based webview UI.
6. The `TutorialPanel` acts as a bridge, forwarding user actions (Next, Prev, Show Solution) from the webview to the `TutorialController`.
7. The `TutorialController` processes actions, updates the `Tutorial` state, interacts with `GitService` and VS Code APIs (for checkouts, diffs, file display, layout changes), and then sends simplified view data back to the `TutorialPanel`.
8. The `TutorialPanel` sends this data to the Svelte webview for rendering.
9. Progress (current step) is persisted via the `Tutorial` instance.

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

### Project Structure

- `src/`
  - `extension.ts` - Extension activation, command registration, main entry point.
  - `controllers/`
    - `TutorialController.ts` - Manages active tutorial session, state, UI logic, communication.
  - `panels/`
    - `TutorialPanel.ts` - Manages the webview panel lifecycle and communication bridge.
  - `services/`
    - `tutorial.ts` - (`TutorialBuilder`, `Tutorial`) Loads tutorial data, holds step state, manages git interaction for steps.
    - `git.ts` - (`GitService`) Encapsulates all Git commands.
  - `utilities/` - Helper functions (e.g., `getNonce`).
- `shared/types/` - TypeScript types shared between extension and webview.
- `webview-ui/` - Svelte code for the webview UI.

### Key Dependencies

- `simple-git` - Git operations
- `markdown-it` - Markdown rendering

## License

MIT
