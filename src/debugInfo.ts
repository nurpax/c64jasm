
import * as path from 'path';

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

    info() {
        return {
            pcToLocs: this.pcToLocs
        };
    }
}
