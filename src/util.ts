
import { DebugInfoTracker } from './debugInfo';
import { SegmentInfo } from './segment';

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
        write(`${indent}</${elt.name}>\n`);
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

type SegmentOut = {
    name: string;
    blocks: { text: string[] }[];
};

export function exportC64debuggerInfo(writeSync: (msg: string) => void, labels: { name: string, addr: number, segmentName: string }[], segmentInfos: SegmentInfo[], debugInfo: DebugInfoTracker) {
    const sourceIdxByName: {[file: string]: number } = {};
    const sources = [];
    for (let i = 0; i < debugInfo.sourceFiles.length; i++) {
        const name = debugInfo.sourceFiles[i];
        sources.push(`${i},${name}`);
        sourceIdxByName[name] = i;
    }

    // Process segments and map program locations to segment/source location.
    // TODO this is messy and probably buggy. :(
    const sortedPC = Object.keys(debugInfo.pcToLocs).map(Number).sort((a,b) => a-b);
    const segmentOut: SegmentOut[] = [{
        name: segmentInfos[0].name,
        blocks: [{ text: [] }]
    }];
    let blockIdx = [0, 0];
pcloop:
    for (const pc of sortedPC) {
        let b = segmentInfos[blockIdx[0]].blocks[blockIdx[1]];

        while (true) {
            const si = segmentInfos[blockIdx[0]];
            b = si.blocks[blockIdx[1]];
            // Found block, emit debug info
            if (pc >= b.start && pc <= b.end) {
                break;
            }
            if (pc < b.start) {
                // TODO these happen on lines that have *=addr but
                // there's no corresponding segment block for this
                // program location.  Feels a little like an off
                // by one bug.
                continue pcloop;
            }
            if (blockIdx[1] != si.blocks.length-1) {
                blockIdx[1] += 1;
                segmentOut[blockIdx[0]].blocks.push({text: []});
            } else {
                blockIdx[0] += 1;
                blockIdx[1] = 0;
                if (blockIdx[0] >= segmentInfos.length) {
                    break pcloop;
                }
                segmentOut.push({
                    name: segmentInfos[blockIdx[0]].name,
                    blocks: [{ text: [] }]
                });
            }
        }
        if (!(pc >= b.start && pc <= b.end)) {
            throw new Error('internal compiler error: inconsistent segments');
        }
        const entry = debugInfo.pcToLocs[pc];
        const outLines = segmentOut[blockIdx[0]].blocks[blockIdx[1]].text;
        for (const ll of entry) {
            outLines.push(`$${toHex16(pc)},${toHex16(pc+ll.numBytes-1)},${sourceIdxByName[ll.source]},${ll.lineNo},1,${ll.lineNo},1`);
        }
    }

    const lbls = labels.map(({ name, addr, segmentName }) => `${segmentName},$${toHex16(addr)},${name}`);

    const segments = segmentOut.map(s => {
        return {
            name: 'Segment',
            attributes: { name: s.name, values: "START,END,FILE_IDX,LINE1,COL1,LINE2,COL2" },
            children: s.blocks.map(b => {
                return {
                    name: 'Block',
                    attributes: { },
                    children: b.text
                }
            })
        }
    });

    writeXml({
        name: 'C64debugger',
        attributes: { version: '1.0' },
        children: [
            {
                name: 'Sources',
                attributes: { values: 'INDEX,FILE' },
                children: sources
            },
            ...segments,
            {
                name: 'Labels',
                attributes: { values: 'SEGMENT,ADDRESS,NAME' },
                children: lbls
            }
        ]
    },
    msg => writeSync(msg));
}
