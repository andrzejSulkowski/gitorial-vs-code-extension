/*
- Wraps Node.js fs operations
- Handles file reading/writing operations
*/
import * as fs from 'fs/promises';
import * as path from 'path';
import { IFileSystem } from 'src/domain/ports/IFileSystem';

// It's good practice to define an interface in the Domain layer
// and implement it here. For example:
// import { IFileSystem } from '../domain/ports/IFileSystem';

export class FileSystemAdapter implements IFileSystem {
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
      const data = await fs.readFile(absolutePath, 'utf-8');
      return data;
    } catch (error) {
      // Log the error or handle it as per application's error handling strategy
      console.error(`Error reading file ${filePath}:`, error);
      throw new Error(`Could not read file: ${filePath}`);
    }
  }

  async pathExists(filePath: string): Promise<boolean> {
    try {
      const absolutePath = path.resolve(filePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureDir(dirPath: string): Promise<void> {
    try {
      const absolutePath = path.resolve(dirPath);
      await fs.mkdir(absolutePath, { recursive: true });
    } catch (error) {
      console.error(`Error ensuring directory ${dirPath}:`, error);
      throw new Error(`Could not create directory: ${dirPath}`);
    }
  }
}