
import * as process from 'process'
import { readFileSync, writeFileSync } from 'fs'

export interface DisasmOptions {
    isInstruction: (addr: number) => boolean
};  

interface ILabel {
    name: string, 
    addr: number, 
    size: number
 }

import opcodes from './opcodes'

function toHex8(v: number): string {
    return `${v.toString(16).toUpperCase().padStart(2, '0')}`
}

function toHex16(v: number): string {
    return `${v.toString(16).toUpperCase().padStart(4, '0')}`
}

/**
 * Returns an array with arrays of the given size.
 *
 * @param myArray {Array} array to split
 * @param chunk_size {Integer} Size of every group
 */
export function chunkArray<T>(myArray: T[], chunk_size: number){
    var index = 0;
    var arrayLength = myArray.length;
    var tempArray = [];

    for (index = 0; index < arrayLength; index += chunk_size) {
        const myChunk = myArray.slice(index, index+chunk_size);
        // Do something if you want with the group
        tempArray.push(myChunk);
    }

    return tempArray;
}

class Disassembler {
    private curAddr: number;
    private curOffs: number;
    private opToDecl: {[index: number]: { mnemonic: string, decode: (number|null)[] }};
    private output: string[];
    private outputPadChars = '     ';
    private outputBytesPerLine = 1;

    private cycle_counts = [
        // 0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F
           7, 6, 2, 8, 3, 3, 5, 5, 3, 2, 2, 2, 4, 4, 6, 6, // 0
           2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, // 1
           6, 6, 2, 8, 3, 3, 5, 5, 4, 2, 2, 2, 4, 4, 6, 6, // 2
           2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, // 3
           6, 6, 2, 8, 3, 3, 5, 5, 3, 2, 2, 2, 3, 4, 6, 6, // 4
           2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, // 5
           6, 6, 2, 8, 3, 3, 5, 5, 4, 2, 2, 2, 5, 4, 6, 6, // 6
           2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, // 7
           2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4, // 8
           2, 6, 2, 6, 4, 4, 4, 4, 2, 5, 2, 5, 5, 5, 5, 5, // 9
           2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4, // A
           2, 5, 2, 5, 4, 4, 4, 4, 2, 4, 2, 4, 4, 4, 4, 4, // B
           2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6, // C
           2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, // D
           2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6, // E
           2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7  // F
        ];

    private bytes: {
        startPC: number,
        bytes: number[]
    } = { startPC: 0, bytes: [] };

    private disasmOptions?: DisasmOptions;
    private labels?: ILabel[];
    private labels_dict: { [addr:number] : string} = {};

    constructor (private buf: Buffer, labels?: ILabel[], disasmOptions?: DisasmOptions) {
        this.output = [];
        this.curAddr = buf.readUInt8(0) + (buf.readUInt8(1)<<8);
        this.curOffs = 2;
        this.disasmOptions = disasmOptions;
        this.labels = labels;

        if (this.disasmOptions && this.disasmOptions.isInstruction) {
            this.outputPadChars = '                                                ';
            this.outputBytesPerLine = 8;
        }

        if (this.labels) {
            this.labels.forEach(({name, addr, size}) => {
                this.labels_dict[addr] = name
            })
        }

        this.opToDecl = {}
        Object.keys(opcodes).forEach(key => {
            let decl = opcodes[key]
            for (let i = 0; i < decl.length; i++) {
                const d = decl[i];
                if (d !== null) {
                    this.opToDecl[d] = { mnemonic: key, decode: decl };
                }
            }
        })
    }

    byte = () => {
        const b = this.buf.readUInt8(this.curOffs);
        this.curOffs++;
        return b
    }

    flushBytes () {
        const chunks = chunkArray(this.bytes.bytes, this.outputBytesPerLine);

        let pc = this.bytes.startPC;
        for (let i = 0; i < chunks.length; i++, pc += this.outputBytesPerLine) {
            const bytes = chunks[i];
            const bstr = bytes.map(b => toHex8(b)).join(' ');
            this.output.push(`${toHex16(pc)}: ${bstr}`);
        }
        this.bytes.bytes = [];
    }

    mem_read(address: number) {
        console.log("read address", address);
        const b = this.buf.readUInt8(address - 2061);
        return b;
    }
    
    mem_write(address: number, value: number) {
        console.log("write address", address);
    }

    print = (addr: number, bytes: number[], decoded: string, label: string, nb_cycle: number) => {
        this.flushBytes();
        const b0 = toHex8(bytes[0]);
        const b1 = bytes.length >= 2 ? toHex8(bytes[1]) : '  ';
        const b2 = bytes.length >= 3 ? toHex8(bytes[2]) : '  ';
        const padChars = this.outputPadChars.substring(0, this.outputPadChars.length - label.length);
        this.output.push(`${toHex16(addr)}: ${b0} ${b1} ${b2} ${label} ${padChars}${decoded}\t; #${nb_cycle}`)
    }

    disImm(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const imm = this.byte();
        this.print(addr, [op, imm], `${mnemonic} #$${toHex8(imm)}`, label, nb_cycle)
    }

    disZp(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const zp = this.byte();
        this.print(addr, [op, zp], `${mnemonic} $${toHex8(zp)}`, label, nb_cycle)
    }

    disZpX(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const zp = this.byte();
        this.print(addr, [op, zp], `${mnemonic} $${toHex8(zp)},X`, label, nb_cycle)
    }

    disZpY(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const zp = this.byte();
        this.print(addr, [op, zp], `${mnemonic} $${toHex8(zp)},Y`, label, nb_cycle)
    }

    disAbs(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const lo = this.byte();
        const hi = this.byte();
        this.print(addr, [op, lo, hi], `${mnemonic} $${toHex16(lo + hi*256)}`, label, nb_cycle)
    }

    disAbsX(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const lo = this.byte();
        const hi = this.byte();
        this.print(addr, [op, lo, hi], `${mnemonic} $${toHex16(lo + hi*256)},X`, label, nb_cycle)
    }

    disAbsY(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const lo = this.byte();
        const hi = this.byte();
        this.print(addr, [op, lo, hi], `${mnemonic} $${toHex16(lo + hi*256)},Y`, label, nb_cycle)
    }

    disInd(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const lo = this.byte();
        const hi = this.byte();
        this.print(addr, [op, lo, hi], `${mnemonic} ($${toHex16(lo + hi*256)})`, label, nb_cycle)
    }

    disIndX(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const lo = this.byte();
        this.print(addr, [op, lo], `${mnemonic} ($${toHex8(lo)},X)`, label, nb_cycle)
    }

    disIndY (mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const lo = this.byte();
        this.print(addr, [op, lo], `${mnemonic} ($${toHex8(lo)}),Y`, label, nb_cycle)
    }

    disSingle(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        this.print(addr, [op], `${mnemonic}`, label, nb_cycle)
    }

    disBranch(mnemonic: string, op: number, label: string, nb_cycle: number) {
        const addr = this.curAddr;
        const lo = this.byte();
        const bofs = lo >= 128 ? -(256-lo) : lo
        const tgt = addr + bofs + 2;
        this.print(addr, [op, lo], `${mnemonic} $${toHex16(tgt)}`, label, nb_cycle)
    }

    disUnknown(op: number) {
        // Delay the string output of raw bytes so
        // that we can output multiple bytes per line
        if (this.bytes.bytes.length !== 0) {
            this.bytes.bytes.push(op);
        } else {
            this.bytes.bytes = [op];
            this.bytes.startPC = this.curAddr;
        }
    }

    disassemble() {
        const len = this.buf.byteLength;
        let isInsn = (addr: number) => true;
        if (this.disasmOptions && this.disasmOptions.isInstruction) {
            isInsn = this.disasmOptions.isInstruction;
        }

        let oldOffs = this.curOffs
        while (this.curOffs < len) {
            this.curAddr += this.curOffs - oldOffs;
            var label = "";
            if (this.curAddr in this.labels_dict) {
                label = this.labels_dict[this.curAddr];
            }
            oldOffs = this.curOffs;

            const op = this.byte()
            const decl = this.opToDecl[op];

            const nb_cycle = this.cycle_counts[op];

            if (isInsn(this.curAddr) && decl !== undefined) {
                const decoderIdx = decl.decode.indexOf(op);
                if (decoderIdx === 0) {
                    this.disImm(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 1) {
                    this.disZp(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 2) {
                    this.disZpX(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 3) {
                    this.disZpY(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 4) {
                    this.disAbs(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 5) {
                    this.disAbsX(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 6) {
                    this.disAbsY(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 7) {
                    this.disInd(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 8) {
                    this.disIndX(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 9) {
                    this.disIndY(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 10) {
                    this.disSingle(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
                if (decoderIdx === 11) {
                    this.disBranch(decl.mnemonic, op, label, nb_cycle);
                    continue;
                }
            } else {
                this.disUnknown(op);
            }
        }
        this.flushBytes();
        return this.output;
    }
}

export function disassemble(prg: Buffer, labels?: ILabel[], options?: DisasmOptions) {
    let disasm = new Disassembler(prg, labels, options);
    return disasm.disassemble();
}
