import * as vscode from 'vscode';
import { IFileSystem } from '../../domain/ports/IFileSystem';

export class VSCodeFileSystemAdapter implements IFileSystem {
  public async pathExists(path: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(path));
      return true;
    } catch (error) {
      // If stat fails (e.g., file not found), it throws an error.
      // We interpret this as the path not existing.
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        return false;
      }
      // For other errors, we might want to re-throw or handle differently,
      // but for a simple existence check, non-existence is the primary outcome.
      return false; 
    }
  }

  public async isDirectory(path: string): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(path));
      return stat.type === vscode.FileType.Directory;
    } catch (error) {
      // If stat fails, the path likely doesn't exist or is inaccessible.
      console.error(`Error checking if path is directory ${path}:`, error);
      throw error; // Re-throw as the contract implies path should exist for this check.
    }
  }

  public async deleteDirectory(path: string): Promise<void> {
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(path), { recursive: true });
    } catch (error) {
      // Handle specific errors if necessary, e.g., path not found could be ignored
      // or re-thrown depending on desired behavior.
      console.error(`Error deleting directory ${path}:`, error);
      throw error;
    }
  }
} 