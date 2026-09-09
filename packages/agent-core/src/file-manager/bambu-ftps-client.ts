import { Client, type FileInfo } from "basic-ftp";
import type { PrinterFileClient, PrinterFileEntry } from "./types";

const BAMBU_FTPS_USER = "bblp";
const BAMBU_FTPS_PORT = 990;

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

function toEntry(dir: string, info: FileInfo): PrinterFileEntry {
  return {
    name: info.name,
    path: joinPath(dir, info.name),
    size: info.size,
    isDirectory: info.isDirectory,
    modifiedAt: new Date(info.modifiedAt ?? Date.now()).toISOString(),
  };
}

export class BambuFtpsClient implements PrinterFileClient {
  constructor(
    private readonly ip: string,
    private readonly accessCode: string,
  ) {}

  private async withConnection<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client();
    try {
      await client.access({
        host: this.ip,
        port: BAMBU_FTPS_PORT,
        user: BAMBU_FTPS_USER,
        password: this.accessCode,
        secure: "implicit",
        // Bambu printers pakai sertifikat TLS self-signed di FTPS-nya -- jangan hapus flag
        // ini untuk "memperbaiki" keamanan, koneksi akan selalu gagal verifikasi kalau iya.
        secureOptions: { rejectUnauthorized: false },
      });
      return await fn(client);
    } finally {
      client.close();
    }
  }

  async list(path: string): Promise<PrinterFileEntry[]> {
    return this.withConnection(async (client) => {
      const raw = await client.list(path);
      return raw.map((info) => toEntry(path, info));
    });
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    await this.withConnection((client) => client.uploadFrom(localPath, remotePath));
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    await this.withConnection((client) => client.downloadTo(localPath, remotePath));
  }

  async delete(remotePath: string): Promise<void> {
    await this.withConnection((client) => client.remove(remotePath));
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.withConnection((client) => client.rename(oldPath, newPath));
  }
}
