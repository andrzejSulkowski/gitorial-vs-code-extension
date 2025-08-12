# Gitorial

![Version](https://img.shields.io/badge/version-0.2.2-yellow)
![VS Code](https://img.shields.io/badge/VS%20Code-1.87.0+-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A VS Code extension that enables interactive, step-by-step, [Gitorial-based](https://github.com/gitorial-sdk) tutorials directly in your editor. Learn coding concepts, frameworks, and best practices through guided, hands-on experiences.

## Funding & Support

<p align="center">
  <img src="./images/Polkadot_Logo_Pink-Black.png" alt="Polkadot Logo" height="60">
</p>

This project is proudly **funded by Polkadot OpenGov**. We're grateful for the community's support in making interactive learning more accessible for developers in the Polkadot ecosystem and beyond.

## Table of Contents

- [Features](#features)
- [How to Use](#how-to-use)
  - [For Tutorial Users](#for-tutorial-users)
  - [For Tutorial Authors](#for-tutorial-authors)
- [Installation](#installation)
- [Development](#development)
- [Commands](#commands)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

- **📚 Interactive Learning**: Clone, navigate, edit, compile and test through structured, step-by-step tutorials
- **📝 Rich Content**: View rendered Markdown content for each tutorial step
- **🔄 Git Integration**: Seamlessly work with tutorial following the Gitorial specification
- **💾 Persistent State**: Automatically remembers your progress across VS Code sessions
- **🎯 Focused Learning**: Automatically opens relevant files for each step
- **🔍 Solution Viewing**: Compare your work with step solutions using built-in diff views
- **🎨 Clean UI**: Dedicated tutorial panel that doesn't interfere with your coding workflow

## How to Use

### For Tutorial Users

#### 1. Clone a New Tutorial

1. Open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run the command **`Gitorial: Clone New Tutorial`**
3. Enter the Git URL of the tutorial repository
4. Select a **parent directory** where the tutorial folder will be created
5. The extension clones the repository into a new sub-folder named after the repository
6. A **new VS Code window** automatically opens with the cloned tutorial folder
7. The Gitorial panel loads automatically

#### 2. Open an Existing Local Tutorial

**Option A: Automatic Detection**

1. Open a folder containing a Gitorial project in VS Code (`File > Open Folder...`)
2. Run the command **`Gitorial: Open Tutorial (Workspace)`**
3. The Gitorial extension will activate, detect the tutorial and open the panel

**Option B: Manual Opening**

1. Use the command **`Gitorial: Open Tutorial`**
2. Choose **"Use Current Workspace"** (if the workspace is the tutorial root) or **"Select Directory..."** to browse to the tutorial folder
3. If you select a directory, it will open in a new VS Code window and trigger tutorial detection

### For Tutorial Authors

For information on creating Gitorial-compatible tutorials, please refer to the official [Gitorial SDK documentation](https://github.com/gitorial-sdk).

> 🏗️ **Coming Soon**: In an upcoming version, the extension will support creating new Gitorials directly from within VS Code.

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`)
3. Search for "Gitorial"
4. Click **Install**

### Manual Installation

1. Download the latest `.vsix` file from the [releases page](https://github.com/gitorial-sdk/gitorial-vscode.git/releases)
2. In VS Code, run `Extensions: Install from VSIX...` from the command palette
3. Select the downloaded `.vsix` file

## Development

For comprehensive information on setting up the development environment, understanding the project architecture, and contributing to the extension, please see the [Development Guide](./DEVELOPMENT.md).

### Quick Start

```bash
# Clone the repository
git clone https://github.com/gitorial-sdk/gitorial-vscode.git
cd gitorial-vs-code-plugin/project

# Install dependencies
pnpm install

# Start development mode (builds shared packages + watches for changes)
pnpm run dev

# Build everything for production
pnpm run build

# Package the extension
pnpm run package

# Open in VS Code and press F5 to run in Extension Development Host
code .
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for the developer documentation.

## Commands

| Command                                 | ID                               | Description                                                                 |
| --------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| **Gitorial: Clone New Tutorial**        | `gitorial.cloneTutorial`         | Clones a new tutorial repository into a selected parent folder and opens it |
| **Gitorial: Open Tutorial**             | `gitorial.openTutorial`          | Opens an existing local tutorial from selected directory                    |
| **Gitorial: Open Tutorial (Workspace)** | `gitorial.openTutorialWorkspace` | Opens an existing local tutorial from current workspace                     |

## Troubleshooting

### Getting Help

- 🐛 [Report bugs](https://github.com/gitorial-sdk/gitorial-vscode.git/issues)
- 💡 [Request features](https://github.com/gitorial-sdk/gitorial-vscode.git/issues)
- 📖 [View documentation](https://github.com/gitorial-sdk)

## Contributing

We welcome contributions! Please see our [Development Guide](./DEVELOPMENT.md) for details on:

- Setting up the development environment
- Understanding the codebase architecture
- Running tests
- Submitting pull requests

## License

MIT © [Andrzej Sulkowski](https://github.com/andrzejSulkowski)

---

**Enjoy learning with Gitorial! 🚀**
