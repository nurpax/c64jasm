
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
            this.outputPadChars = '                    ';
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

    print = (addr: number, bytes: number[], decoded: string, label: string) => {
        this.flushBytes();
        const b0 = toHex8(bytes[0]);
        const b1 = bytes.length >= 2 ? toHex8(bytes[1]) : '  ';
        const b2 = bytes.length >= 3 ? toHex8(bytes[2]) : '  ';
        const padChars = this.outputPadChars.substring(0, this.outputPadChars.length - label.length);
        this.output.push(`${toHex16(addr)}: ${b0} ${b1} ${b2} ${label} ${padChars}${decoded}`)
    }

    disImm(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const imm = this.byte();
        this.print(addr, [op, imm], `${mnemonic} #$${toHex8(imm)}`, label)
    }

    disZp(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const zp = this.byte();
        this.print(addr, [op, zp], `${mnemonic} $${toHex8(zp)}`, label)
    }

    disZpX(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const zp = this.byte();
        this.print(addr, [op, zp], `${mnemonic} $${toHex8(zp)},X`, label)
    }

    disZpY(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const zp = this.byte();
        this.print(addr, [op, zp], `${mnemonic} $${toHex8(zp)},Y`, label)
    }

    disAbs(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const lo = this.byte();
        const hi = this.byte();
        this.print(addr, [op, lo, hi], `${mnemonic} $${toHex16(lo + hi*256)}`, label)
    }

    disAbsX(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const lo = this.byte();
        const hi = this.byte();
        this.print(addr, [op, lo, hi], `${mnemonic} $${toHex16(lo + hi*256)},X`, label)
    }

    disAbsY(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const lo = this.byte();
        const hi = this.byte();
        this.print(addr, [op, lo, hi], `${mnemonic} $${toHex16(lo + hi*256)},Y`, label)
    }

    disInd(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const lo = this.byte();
        const hi = this.byte();
        this.print(addr, [op, lo, hi], `${mnemonic} ($${toHex16(lo + hi*256)})`, label)
    }

    disIndX(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const lo = this.byte();
        this.print(addr, [op, lo], `${mnemonic} ($${toHex8(lo)},X)`, label)
    }

    disIndY (mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const lo = this.byte();
        this.print(addr, [op, lo], `${mnemonic} ($${toHex8(lo)}),Y`, label)
    }

    disSingle(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        this.print(addr, [op], `${mnemonic}`, label)
    }

    disBranch(mnemonic: string, op: number, label: string) {
        const addr = this.curAddr;
        const lo = this.byte();
        const bofs = lo >= 128 ? -(256-lo) : lo
        const tgt = addr + bofs + 2;
        this.print(addr, [op, lo], `${mnemonic} $${toHex16(tgt)}`, label)
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

            if (isInsn(this.curAddr) && decl !== undefined) {
                const decoderIdx = decl.decode.indexOf(op);
                if (decoderIdx === 0) {
                    this.disImm(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 1) {
                    this.disZp(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 2) {
                    this.disZpX(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 3) {
                    this.disZpY(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 4) {
                    this.disAbs(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 5) {
                    this.disAbsX(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 6) {
                    this.disAbsY(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 7) {
                    this.disInd(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 8) {
                    this.disIndX(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 9) {
                    this.disIndY(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 10) {
                    this.disSingle(decl.mnemonic, op, label);
                    continue;
                }
                if (decoderIdx === 11) {
                    this.disBranch(decl.mnemonic, op, label);
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
