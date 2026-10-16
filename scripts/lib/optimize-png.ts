import { execFileSync } from 'node:child_process';

/** Strips metadata and recompresses a PNG in place (lossless), with ImageMagick's `magick`. */
export function optimizePng(path: string): void {
    execFileSync('magick', [
        path,
        '-strip',
        '-define',
        'png:compression-level=9',
        path,
    ]);
}
