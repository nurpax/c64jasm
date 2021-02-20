
import { DebugInfoTracker } from './debugInfo';

export function toHex16(v: number): string {
    return v.toString(16).padStart(4, '0');
}

interface XmlElement {
    name: string;
    attributes: {[key: string]: string };
    children: XmlElement[] | string[];
};

function isXmlElement(object: any): object is XmlElement {
    if (typeof object === 'object') {
        return 'name' in object;
    }
    return false;
}

function writeXml(xml: XmlElement, write: (s: string) => void) {
    function recurse(elt: XmlElement, depth: number) {
        const attrs = Object.entries(elt.attributes).map(([k,v]) => `${k}="${v}"`).join (' ');
        const indent = '  '.repeat(depth);
        write(`${indent}<${elt.name}${attrs !== '' ? ` ${attrs}` : ''}>\n`);
        if (elt.children.length !== 0) {
            if (isXmlElement(elt.children[0])) {
                for (const c of elt.children) {
                    recurse(c as XmlElement, depth+1);
                }
            } else {
                const indent = '  '.repeat(depth+1);
                for (const line of elt.children) {
                    write(`${indent}${line}\n`);
                }
            }
        }
        write(`${indent}</${elt.name}}>\n`);
    }
    recurse(xml, 0);
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

export function exportC64debuggerInfo(writeSync: (msg: string) => void, labels: { name: string, addr: number, segmentName: string }[], debugInfo: DebugInfoTracker) {
    const sources = debugInfo.sourceFiles.map((src,idx) => `${idx},${src}`);
    const lbls = labels.map(({ name, addr, segmentName }) => `${segmentName},$${toHex16(addr)},${name}`);
    writeXml({
        name: 'C64debugger',
        attributes: { version: '1.0' },
        children: [
            {
                name: 'Sources',
                attributes: { values: 'INDEX,FILE' },
                children: sources
            },
            {
                name: 'Labels',
                attributes: { values: 'SEGMENT,ADDRESS,NAME' },
                children: lbls
            }
        ]
    },
    msg => writeSync(msg));
}
