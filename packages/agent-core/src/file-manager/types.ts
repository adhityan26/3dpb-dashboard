export interface PrinterFileEntry {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

export interface PrinterFileClient {
  list(path: string): Promise<PrinterFileEntry[]>;
  upload(localPath: string, remotePath: string): Promise<void>;
  download(remotePath: string, localPath: string): Promise<void>;
  delete(remotePath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
}
