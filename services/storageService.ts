
import { Acordao } from '../types';

export class StorageService {
  private static rootHandle: FileSystemDirectoryHandle | null = null;
  private static isFallbackMode = false;
  private static db: IDBDatabase | null = null;

  private static async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('JurisAnalyzerDB', 2);
      request.onupgradeneeded = (event: any) => {
        const db = request.result;
        if (!db.objectStoreNames.contains('acordaos')) {
          db.createObjectStore('acordaos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('raw_files')) {
          db.createObjectStore('raw_files', { keyPath: 'name' });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async selectDirectory(): Promise<{ success: boolean; mode: 'native' | 'virtual' }> {
    try {
      // @ts-ignore
      this.rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      this.isFallbackMode = false;
      return { success: true, mode: 'native' };
    } catch (err: any) {
      if (err.name === 'SecurityError' || err.name === 'NotAllowedError' || err.message.includes('cross origin')) {
        await this.initDB();
        this.isFallbackMode = true;
        return { success: true, mode: 'virtual' };
      }
      return { success: false, mode: 'virtual' };
    }
  }

  static isReady(): boolean {
    return this.rootHandle !== null || this.isFallbackMode;
  }

  static getMode(): 'native' | 'virtual' {
    return this.isFallbackMode ? 'virtual' : 'native';
  }

  // Guarda o conteúdo bruto capturado do URL
  static async saveRawTxt(name: string, content: string, subfolder?: string): Promise<void> {
    if (this.isFallbackMode) {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('raw_files', 'readwrite');
        const store = transaction.objectStore('raw_files');
        store.put({ name, content, subfolder, timestamp: Date.now() });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }

    if (!this.rootHandle) return;
    let targetDir = this.rootHandle;
    if (subfolder) targetDir = await this.rootHandle.getDirectoryHandle(subfolder, { create: true });
    
    const fileHandle = await targetDir.getFileHandle(`${name}.txt`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  // Lista ficheiros TXT para processamento
  static async listRawFiles(): Promise<{name: string, content: string}[]> {
    if (this.isFallbackMode) {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('raw_files', 'readonly');
        const store = transaction.objectStore('raw_files');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    if (!this.rootHandle) return [];
    const files: {name: string, content: string}[] = [];
    
    async function scan(handle: FileSystemDirectoryHandle) {
      // @ts-ignore
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.txt')) {
          const file = await (entry as FileSystemFileHandle).getFile();
          const content = await file.text();
          files.push({ name: entry.name, content });
        } else if (entry.kind === 'directory') {
          await scan(entry as FileSystemDirectoryHandle);
        }
      }
    }
    await scan(this.rootHandle);
    return files;
  }

  static async saveProcessedAcordao(acordao: Acordao): Promise<void> {
    if (this.isFallbackMode) {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('acordaos', 'readwrite');
        const store = transaction.objectStore('acordaos');
        store.put(acordao);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }

    if (!this.rootHandle) return;
    const fileHandle = await this.rootHandle.getFileHandle(`${acordao.ecli.replace(/[:/\\?%*|"<>]/g, '_')}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(acordao, null, 2));
    await writable.close();
  }

  static async listProcessedAcordaos(): Promise<Acordao[]> {
    if (this.isFallbackMode) {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('acordaos', 'readonly');
        const store = transaction.objectStore('acordaos');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    if (!this.rootHandle) return [];
    const results: Acordao[] = [];
    async function scan(handle: FileSystemDirectoryHandle) {
      // @ts-ignore
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          const file = await (entry as FileSystemFileHandle).getFile();
          try {
            const data = JSON.parse(await file.text());
            if (data.ecli) results.push(data);
          } catch (e) {}
        } else if (entry.kind === 'directory') {
          await scan(entry as FileSystemDirectoryHandle);
        }
      }
    }
    await scan(this.rootHandle);
    return results;
  }
}
