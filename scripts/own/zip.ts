// zip を読む（Node の標準機能だけ）。macOS の unzip は、Studio の書き出しの日本語のファイル名を展開できないため
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry { name: string; data: Buffer; }

const EOCD = 0x06054b50; // 終端レコード
const CENTRAL = 0x02014b50; // 中央ディレクトリ
const LOCAL = 0x04034b50; // ローカルヘッダー

export function readZip(buf: Buffer): ZipEntry[] {
  // 終端レコードは末尾（コメントぶん最大 65535 バイト手前まで）にある
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip ではありません（終端レコードが見つかりません）');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CENTRAL) throw new Error('zip の中央ディレクトリが壊れています');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    // UTF-8 のフラグがなくても、Studio や macOS の zip は UTF-8 で名前を書くので UTF-8 として読む
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen).normalize('NFC');
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // フォルダ
    if (buf.readUInt32LE(local) !== LOCAL) throw new Error(`zip のローカルヘッダーが壊れています（${name}）`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compSize);
    if (method === 0) out.push({ name, data: Buffer.from(raw) });
    else if (method === 8) out.push({ name, data: inflateRawSync(raw) });
    else throw new Error(`対応していない圧縮方式です（${name}, method ${method}）`);
  }
  return out;
}
