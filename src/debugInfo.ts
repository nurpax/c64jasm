
import * as path from 'path';

const FastBitSet = require('fastbitset');

import { SourceLoc } from './ast';
import { Segment } from './segment';

type LineLoc = {
    source: string;
    lineNo: number;
    numBytes: number;
};

type LocPCEntry = { loc: LineLoc, pc: number, segmentId: number };

// Track source locations and code memory placement
export class DebugInfoTracker {
    private sourceFileSet = new Set();
    sourceFiles: string[] = [];
    lineStack: LocPCEntry[] = [];
    pcToLocs: { [pc: number]: LineLoc[] } = {};
    insnBitset = new FastBitSet();
    private breakpoints: {addr: number, segmentName: string}[] = [];

    startLine(loc: SourceLoc, codePC: number, segment: Segment) {
        const source = path.resolve(loc.source);
        const l = {
            source,
            lineNo: loc.start.line,
            segmentId: segment.id,
            numBytes: 0
        }
        this.lineStack.push({loc: l, pc: codePC, segmentId: segment.id });
        // Track what source files have been seen during compilation.
        if (!this.sourceFileSet.has(source)) {
            this.sourceFiles.push(source);
            this.sourceFileSet.add(source);
        }
    }

    endLine(curPC: number, curSegment: Segment) {
        const entry = this.lineStack.pop();
        if (!entry) {
            throw new Error('internal compiler error, mismatching start/end lines in debugInfo')
        }

        const numBytesEmitted = curPC - entry.pc;
        if (numBytesEmitted > 0 && curSegment.id === entry.segmentId) {
            const e = { ...entry.loc, numBytes: numBytesEmitted };
            if (this.pcToLocs[entry.pc] === undefined) {
                this.pcToLocs[entry.pc] = [e];
            } else {
                this.pcToLocs[entry.pc].push(e);
            }
        }
    }

    markAsInstruction(start: number, end: number) {
        for (let i = start; i < end; i++) {
            this.insnBitset.add(i);
        }
    }

    markBreak(addr: number, segmentName: string) {
        this.breakpoints.push({ addr, segmentName });
    }

    info() {
        const insnBitset = this.insnBitset.clone();
        const isInstruction = (addr: number) => {
            return insnBitset.has(addr);
        };

        return {
            pcToLocs: this.pcToLocs,
            breakpoints: this.breakpoints,
            sourceFiles: this.sourceFiles,
            isInstruction
        };
    }
}
