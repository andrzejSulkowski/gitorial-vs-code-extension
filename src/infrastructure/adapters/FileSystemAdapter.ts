/*
- Wraps Node.js fs operations
- Handles file reading/writing operations
*/
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// It's good practice to define an interface in the Domain layer
// and implement it here. For example:
// import { IFileSystem } from '../domain/ports/IFileSystem';

//once implements IFileSystem, now its not being used
export class FileSystemAdapter {
  join(path1: string, path2: string): string {
    return path.join(path1, path2);
  }

  async isDirectory(path: string): Promise<boolean> {
    const stats = await fs.stat(path);
    return stats.isDirectory();
  }

  async deleteDirectory(path: string): Promise<void> {
    await fs.rmdir(path, { recursive: true });
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const absolutePath = path.resolve(filePath);
      return await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      throw new Error(`Could not read file: ${filePath}`);
    }
  }

  async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(path.resolve(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(path.resolve(dirPath), { recursive: true });
    } catch (error) {
      console.error(`Error ensuring directory ${dirPath}:`, error);
      throw new Error(`Could not create directory: ${dirPath}`);
    }
  }
}
