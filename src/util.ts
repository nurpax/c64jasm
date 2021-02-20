
import { DebugInfoTracker } from './debugInfo';

export function toHex16(v: number): string {
    return v.toString(16).padStart(4, '0');
}

export function exportViceMoncommands(writeSync: (msg: string) => void, labels: { name: string, addr: number}[], debugInfo: DebugInfoTracker) {
    for (const { name, addr } of labels) {
        const msg = `al C:${toHex16(addr)} .${name}\n`;
        writeSync(msg);
    }
    for (const addr of debugInfo.info().breakpoints) {
        const msg = `break ${toHex16(addr)}\n`;
        writeSync(msg);
    }
}
