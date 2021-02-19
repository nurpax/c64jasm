
import * as path from 'path';

const FastBitSet = require('fastbitset');

import { SourceLoc } from './ast';

type LineLoc = {
    source: string;
    lineNo: number;
};

type LocPCEntry = { loc: LineLoc, pc: number };

// Track source locations and code memory placement
export class DebugInfoTracker {
    lineStack: LocPCEntry[] = [];
    pcToLocs: { [pc: number]: LineLoc[] } = {};
    insnBitset = new FastBitSet();
    private breakpoints = new Set<number>();

    startLine(loc: SourceLoc, codePC: number) {
        const l = {
            source: path.resolve(loc.source),
            lineNo: loc.start.line
        }
        this.lineStack.push({loc: l, pc: codePC });
    }

    endLine(curPC: number) {
        const entry = this.lineStack.pop();
        if (!entry) {
            throw new Error('internal compiler error, mismatching start/end lines in debugInfo')
        }
        const numBytesEmitted = curPC - entry.pc;
        if (numBytesEmitted > 0) {
            const locList = this.pcToLocs[entry.pc] || ([] as LineLoc[]);
            locList.push(entry.loc);
            this.pcToLocs[entry.pc] = locList;
        }
    }

    markAsInstruction(start: number, end: number) {
        for (let i = start; i < end; i++) {
            this.insnBitset.add(i);
        }
    }

    markBreak(addr: number) {
        this.breakpoints.add(addr);
    }

    info() {
        const insnBitset = this.insnBitset.clone();
        const isInstruction = (addr: number) => {
            return insnBitset.has(addr);
        };

        return {
            pcToLocs: this.pcToLocs,
            breakpoints: this.breakpoints.values(),
            isInstruction
        };
    }
}
