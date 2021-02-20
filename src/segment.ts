
import { toHex16 } from './util'

export type SegmentInfo = {
     name: string;
     blocks: { start: number, end: number}[];
};

type Block = { start: number, binary: number[] };

// { start: number, end: number, cur: number};
class Segment {
    start: number;
    end?: number;
    id: number;
    inferStart: boolean; // allow 'start' to be set lazily (so the platform default can be overridden)
    initialStart: number;
    curBlock: Block;
    blocks: Block[];

    constructor(start: number, end: number | undefined, inferStart: boolean, id: number) {
        this.start = start;
        this.end = end;
        this.inferStart = inferStart;
        this.id = id;
        this.blocks = [{
            start,
            binary: []
        }];
        this.curBlock = this.blocks[0];
    }

    // Setting the current PC will start a new "memory block".  A segment
    // consists of multiple memory blocks.
    setCurrentPC(pc: number): string|undefined {
        let err = undefined;
        // Overriding default segment start for the 'default' segment?
        if (this.inferStart && this.blocks.length === 1 && this.blocks[0].binary.length === 0) {
            // This case is for the "default" segment where we just detect the
            // first:
            //
            //   * = some values
            //
            // and make that the segment 'start' address.
            this.start = pc;
        } else {
            const endstr = this.end !== undefined ? `$${toHex16(this.end)}` : '';
            const range = `Segment address range: $${toHex16(this.start)}-${endstr}`;
            if (pc < this.start) {
                err = `${range}.  Cannot set program counter to a lower address $${toHex16(pc)}.`;
            } else {
                if (this.end !== undefined && pc > this.end) {
                    err = `${range}.  Trying to set program counter to $${toHex16(pc)} -- it is past segment end ${endstr}.`;
                } else {
                    if (this.blocks.length === 1 && this.blocks[0].binary.length === 0) {
                        this.start = pc;
                    }
                }
            }
        }
        const newBlock = {
            start: pc,
            binary: []
        };
        const idx = this.blocks.push(newBlock);
        this.curBlock = this.blocks[idx-1];
        return err;
    }

    empty(): boolean {
        return this.blocks.every(b => b.binary.length === 0);
    }

    currentPC(): number {
        return this.curBlock.start + this.curBlock.binary.length;
    }

    emit(byte: number): string|undefined {
        if ((this.currentPC() < this.start) || (this.end !== undefined && this.currentPC() > this.end)) {
            const endstr = this.end !== undefined ? `$${toHex16(this.end)}` : '';
            const startstr = this.start !== undefined ? `$${toHex16(this.start)}` : '';
            return `Segment overflow at $${toHex16(this.currentPC())}.  Segment address range: ${startstr}-${endstr}`;
        }
        this.curBlock.binary.push(byte);
        return undefined;
    }

    formatRange() {
        const endstr = this.end !== undefined ? `$${toHex16(this.end)}` : '';
        const startstr = this.start !== undefined ? `$${toHex16(this.start)}` : '';
        return `${startstr}-${endstr}`;
    }

    overlaps(another: Segment): boolean {
        const startA = this.start;
        const startB = another.start;
        const endA = this.end !== undefined ? this.end : this.currentPC();
        const endB = another.end !== undefined ? another.end : another.currentPC();

        if (startA < startB) {
            return startB <= endA;
        }
        return endB >= startA;
    }
}

// Remove empty segments and sort blocks by start address
function compact(segments: [string, Segment][]): [string, Segment][] {
    const out: [string, Segment][] = [];
    for (const [name,seg] of segments) {
        const compactBlocks = seg.blocks.filter(b => b.binary.length !== 0).sort((a,b) => a.start - b.start);
        if (compactBlocks.length !== 0) {
            const newSeg = new Segment(seg.start, seg.end, seg.inferStart, out.length-1);
            newSeg.blocks = compactBlocks;
            newSeg.curBlock = compactBlocks[compactBlocks.length-1];
            out.push([name, newSeg]);
        }
    }
    return out;
}

function mergeSegments(segments_: [string, Segment][]): {
    startPC: number,
    binary: Buffer
} {
    const segments = compact(segments_);
    if (segments.length === 0) {
        return {
            startPC: 0,
            binary: Buffer.from([])
        }
    }

    const [_, s0] = segments[0];
    const block0 = s0.blocks[0];
    const blockN = s0.blocks[s0.blocks.length-1];
    let minAddr = block0.start;
    let maxAddr = blockN.start + blockN.binary.length;

    for (let i = 1; i < segments.length; i++) {
        const s = segments[i][1];
        const firstPC = s.blocks[0].start;
        const lastPC  = s.curBlock.start + s.curBlock.binary.length;
        minAddr = Math.min(firstPC, minAddr);
        maxAddr = Math.max(lastPC, maxAddr);
    }

    const buf = Buffer.alloc(maxAddr, 0);
    for (const [_, seg] of segments) {
        for (const b of seg.blocks) {
            Buffer.from(b.binary).copy(buf, b.start);
        }
    }

    return {
        startPC: minAddr,
        binary: buf.slice(minAddr)
    }
}

function collectSegmentInfo(segments_: [string, Segment][]): SegmentInfo[] {
    // Sort segments and blocks.
    const segments = compact(segments_).sort((a,b) => a[1].start - b[1].start);
    return segments.map(([name,s]) => {
        const blocks = s.blocks.map(b => {
            return { start: b.start, end: b.start + b.binary.length - 1 };
        });
        return { name, blocks };
    });
}

export { Segment, mergeSegments, collectSegmentInfo };
