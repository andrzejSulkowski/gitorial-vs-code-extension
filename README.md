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
1. Clones the tutorial repository into a user-selected location
2. Discovers steps by reading numbered directories in the `steps/` folder
3. Parses metadata and README files to build the tutorial structure
4. Renders tutorial content as a webview with navigation controls
5. Maintains your progress between VS Code sessions

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

- `src/extension.ts` - Main extension code
- `src/types.ts` - TypeScript types and interfaces

### Key Dependencies

- `simple-git` - Git operations
- `markdown-it` - Markdown rendering

## License

MIT
