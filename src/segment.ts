
import { toHex16 } from './util'

type Block = { start: number, binary: number[] };

// { start: number, end: number, cur: number};
class Segment {
    start: number;
    end?: number;
    curBlock: Block;
    blocks: Block[];

    constructor(start: number, end?: number) {
        this.start = start;
        this.end = end;
        this.blocks = [{
            start: start,
            binary: []
        }];
        this.curBlock = this.blocks[0];
    }

    // Setting the current PC will start a new "memory block".  A segment
    // consists of multiple memory blocks.
    setCurrentPC(pc: number) {
        const newBlock = {
            start: pc,
            binary: []
        };
        const idx = this.blocks.push(newBlock);
        this.curBlock = this.blocks[idx-1];
    }

    empty(): boolean {
        return this.blocks.every(b => b.binary.length === 0);
    }

    currentPC(): number {
        return this.curBlock.start + this.curBlock.binary.length;
    }

    emit(byte: number): string|undefined {
        if (this.end !== undefined && this.currentPC() > this.end) {
            return `Segment overflow at $${toHex16(this.currentPC())}.  Segment address range: $${toHex16(this.start)}-$${toHex16(this.end)}`;
        }
        this.curBlock.binary.push(byte);
        return undefined;
    }
}

// Remove empty segments
function compact(segments: [string, Segment][]): [string, Segment][] {
    const out: [string, Segment][] = [];
    for (const [name,seg] of segments) {
        const compactBlocks = seg.blocks.filter(b => b.binary.length !== 0);
        if (compactBlocks.length !== 0) {
            const newSeg = new Segment(seg.start, seg.end);
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

export { Segment, mergeSegments };
