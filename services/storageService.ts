
import { Acordao } from '../types';

export class StorageService {
  private static rootHandle: FileSystemDirectoryHandle | null = null;
  private static isFallbackMode = false;
  private static db: IDBDatabase | null = null;

  private static async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('JurisAnalyzerDB', 3);
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
      this.rootHandle = await window.showDirectoryPicker({ 
        mode: 'readwrite',
        id: 'juris-analyzer-workdir'
      });
      this.isFallbackMode = false;
      return { success: true, mode: 'native' };
    } catch (err: any) {
      await this.initDB();
      this.isFallbackMode = true;
      return { success: true, mode: 'virtual' };
    }
  }

  static isReady(): boolean {
    return this.rootHandle !== null || this.isFallbackMode;
  }

  static async saveRawTxt(name: string, content: string): Promise<void> {
    if (this.isFallbackMode) {
      const db = await this.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('raw_files', 'readwrite');
        const store = transaction.objectStore('raw_files');
        store.put({ name, content, timestamp: Date.now() });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }

    if (!this.rootHandle) return;
    const fileHandle = await this.rootHandle.getFileHandle(`${name}.txt`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

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
    // @ts-ignore
    for await (const entry of this.rootHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.txt')) {
        const file = await (entry as FileSystemFileHandle).getFile();
        const content = await file.text();
        files.push({ name: entry.name.replace('.txt', ''), content });
      }
    }
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
    // Sanitizar nome do ficheiro para evitar caracteres proibidos no Windows/Linux
    const safeName = acordao.ecli.replace(/[:/\\?%*|"<>]/g, '_').substring(0, 100);
    const fileHandle = await this.rootHandle.getFileHandle(`${safeName}.json`, { create: true });
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
    // @ts-ignore
    for await (const entry of this.rootHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        const file = await (entry as FileSystemFileHandle).getFile();
        try {
          const content = await file.text();
          const data = JSON.parse(content);
          if (data.ecli || data.processo) {
            results.push(data);
          }
        } catch (e) {
          console.error(`Erro ao ler ficheiro ${entry.name}:`, e);
        }
      }
    }
    return results;
  }

  static async deleteRawFile(name: string): Promise<void> {
    if (this.isFallbackMode) {
      const db = await this.initDB();
      const transaction = db.transaction('raw_files', 'readwrite');
      transaction.objectStore('raw_files').delete(name);
      return;
    }
    try {
      await this.rootHandle?.removeEntry(`${name}.txt`);
    } catch (e) {}
  }

  static async downloadJson(data: any, fileName: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
