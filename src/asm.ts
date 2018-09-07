
import * as process from 'process'

let parser = require('./g_parser.js')

import { readFileSync, writeFileSync } from 'fs'

interface SourceLine {
    lineNo: number,
    line: string
}

// this stolen from here: https://github.com/skilldrick/6502js/blob/master/assembler.js
const opcodes = {
  /* Name, Imm,  ZP,   ZPX,  ZPY,  ABS, ABSX, ABSY,  IND, INDX, INDY, SNGL, BRA */
  'ADC': [0x69, 0x65, 0x75, null, 0x6d, 0x7d, 0x79, null, 0x61, 0x71, null, null],
  'AND': [0x29, 0x25, 0x35, null, 0x2d, 0x3d, 0x39, null, 0x21, 0x31, null, null],
  'ASL': [null, 0x06, 0x16, null, 0x0e, 0x1e, null, null, null, null, 0x0a, null],
  'BIT': [null, 0x24, null, null, 0x2c, null, null, null, null, null, null, null],
  'BPL': [null, null, null, null, null, null, null, null, null, null, null, 0x10],
  'BMI': [null, null, null, null, null, null, null, null, null, null, null, 0x30],
  'BVC': [null, null, null, null, null, null, null, null, null, null, null, 0x50],
  'BVS': [null, null, null, null, null, null, null, null, null, null, null, 0x70],
  'BCC': [null, null, null, null, null, null, null, null, null, null, null, 0x90],
  'BCS': [null, null, null, null, null, null, null, null, null, null, null, 0xb0],
  'BNE': [null, null, null, null, null, null, null, null, null, null, null, 0xd0],
  'BEQ': [null, null, null, null, null, null, null, null, null, null, null, 0xf0],
  'BRK': [null, null, null, null, null, null, null, null, null, null, 0x00, null],
  'CMP': [0xc9, 0xc5, 0xd5, null, 0xcd, 0xdd, 0xd9, null, 0xc1, 0xd1, null, null],
  'CPX': [0xe0, 0xe4, null, null, 0xec, null, null, null, null, null, null, null],
  'CPY': [0xc0, 0xc4, null, null, 0xcc, null, null, null, null, null, null, null],
  'DEC': [null, 0xc6, 0xd6, null, 0xce, 0xde, null, null, null, null, null, null],
  'EOR': [0x49, 0x45, 0x55, null, 0x4d, 0x5d, 0x59, null, 0x41, 0x51, null, null],
  'CLC': [null, null, null, null, null, null, null, null, null, null, 0x18, null],
  'SEC': [null, null, null, null, null, null, null, null, null, null, 0x38, null],
  'CLI': [null, null, null, null, null, null, null, null, null, null, 0x58, null],
  'SEI': [null, null, null, null, null, null, null, null, null, null, 0x78, null],
  'CLV': [null, null, null, null, null, null, null, null, null, null, 0xb8, null],
  'CLD': [null, null, null, null, null, null, null, null, null, null, 0xd8, null],
  'SED': [null, null, null, null, null, null, null, null, null, null, 0xf8, null],
  'INC': [null, 0xe6, 0xf6, null, 0xee, 0xfe, null, null, null, null, null, null],
  'JMP': [null, null, null, null, 0x4c, null, null, 0x6c, null, null, null, null],
  'JSR': [null, null, null, null, 0x20, null, null, null, null, null, null, null],
  'LDA': [0xa9, 0xa5, 0xb5, null, 0xad, 0xbd, 0xb9, null, 0xa1, 0xb1, null, null],
  'LDX': [0xa2, 0xa6, null, 0xb6, 0xae, null, 0xbe, null, null, null, null, null],
  'LDY': [0xa0, 0xa4, 0xb4, null, 0xac, 0xbc, null, null, null, null, null, null],
  'LSR': [null, 0x46, 0x56, null, 0x4e, 0x5e, null, null, null, null, 0x4a, null],
  'NOP': [null, null, null, null, null, null, null, null, null, null, 0xea, null],
  'ORA': [0x09, 0x05, 0x15, null, 0x0d, 0x1d, 0x19, null, 0x01, 0x11, null, null],
  'TAX': [null, null, null, null, null, null, null, null, null, null, 0xaa, null],
  'TXA': [null, null, null, null, null, null, null, null, null, null, 0x8a, null],
  'DEX': [null, null, null, null, null, null, null, null, null, null, 0xca, null],
  'INX': [null, null, null, null, null, null, null, null, null, null, 0xe8, null],
  'TAY': [null, null, null, null, null, null, null, null, null, null, 0xa8, null],
  'TYA': [null, null, null, null, null, null, null, null, null, null, 0x98, null],
  'DEY': [null, null, null, null, null, null, null, null, null, null, 0x88, null],
  'INY': [null, null, null, null, null, null, null, null, null, null, 0xc8, null],
  'ROR': [null, 0x66, 0x76, null, 0x6e, 0x7e, null, null, null, null, 0x6a, null],
  'ROL': [null, 0x26, 0x36, null, 0x2e, 0x3e, null, null, null, null, 0x2a, null],
  'RTI': [null, null, null, null, null, null, null, null, null, null, 0x40, null],
  'RTS': [null, null, null, null, null, null, null, null, null, null, 0x60, null],
  'SBC': [0xe9, 0xe5, 0xf5, null, 0xed, 0xfd, 0xf9, null, 0xe1, 0xf1, null, null],
  'STA': [null, 0x85, 0x95, null, 0x8d, 0x9d, 0x99, null, 0x81, 0x91, null, null],
  'TXS': [null, null, null, null, null, null, null, null, null, null, 0x9a, null],
  'TSX': [null, null, null, null, null, null, null, null, null, null, 0xba, null],
  'PHA': [null, null, null, null, null, null, null, null, null, null, 0x48, null],
  'PLA': [null, null, null, null, null, null, null, null, null, null, 0x68, null],
  'PHP': [null, null, null, null, null, null, null, null, null, null, 0x08, null],
  'PLP': [null, null, null, null, null, null, null, null, null, null, 0x28, null],
  'STX': [null, 0x86, null, 0x96, 0x8e, null, null, null, null, null, null, null],
  'STY': [null, 0x84, 0x94, null, 0x8c, null, null, null, null, null, null, null],
  '---': [null, null, null, null, null, null, null, null, null, null, null, null]
};

function readLines (fname) {
    return readFileSync(fname).toString().split('\n')
}

const filterMap = (lst, mf) => {
    return lst.map((l,i) => mf(l, i)).filter(elt => elt !== null);
}

function tryParseInt(s): number | null {
    if (s.length < 1) {
        return null
    }
    if (s[0] == '$') {
        const v = parseInt(s.slice(1), 16);
        return isNaN(v) ? null : v
    } else {
        const v = parseInt(s, 10);
        return isNaN(v) ? null : v
    }
}

function tryParseSymbol(s): string | null {
    const m = /^([a-zA-Z_]+[0-9a-zA-Z_]*)$/.exec(s)
    if (m !== null) {
        return m[1];
    }
    return null
}

function toHex(num) {
    const h = num.toString(16)
    return num < 16 ? `0${h}` : `${h}`
}

interface Label {
    addr: number,
    lineNo: number
}

class Labels {
    labels = {}

    add = (name: string, addr: number, lineNo: number) => {
        const lbl: Label = {
            addr,
            lineNo
        }
        this.labels[name] = lbl
    }

    find = (name: string) => {
        return this.labels[name]
    }
}

class Assembler {
    // TODO this should be a resizable array instead
    binary: number[] = [];

    currentLineNo = 0;
    codePC = 0;
    pass = 0;
    labels = new Labels()

    prg = () => {
      // 1,8 is for encoding the $0801 starting address in the .prg file
      return Buffer.from([1, 8].concat(this.binary))
    }

    error = (err: string) => {
        console.log(`src/foo.asm:${this.currentLineNo} - ${err}`)
    }

    startPass = (pass: number) => {
      this.codePC = 0x801;
      this.pass = pass;
      this.binary = [];
    }

    emitBasicHeader = () => {
      this.emit(0x0c);
      this.emit(0x08);
      this.emit(0x00);
      this.emit(0x00);
      this.emit(0x9e);
      const addr = 0x80d
      const dividers = [10000, 1000, 100, 10, 1]
      dividers.forEach(div => {
        if (addr >= div) {
          this.emit(0x30 + (addr / div) % 10)
        }
      });
      this.emit(0);
      this.emit(0);
      this.emit(0);
    }

    evalExpr = (ast) => {
        const evalExpr = (node) => {
            if (node.type === 'binary') {
                const left = evalExpr(node.left);
                const right = evalExpr(node.right);
                if (left === null || right === null) {
                    return null
                }
                switch (node.op) {
                    case '+': return left + right
                    case '-': return left - right
                    case '*': return left * right
                    case '/': return left / right
                    case '%': return left % right
                    case '&': return left & right
                    case '|': return left | right
                    case '^': return left ^ right
                    case '<<': return left << right
                    case '>>': return left >> right
                    default:
                        this.error(`Unhandled binary operator ${node.operator}`);
                        return null
                }
            }
            if (node.type === 'UnaryExpression') {
                const arg = evalExpr(node.argument);
                switch (node.operator) {
                    case '-': return -arg
                    case '~': return ~arg
                    default:
                        this.error(`Unhandled unary operator ${node.operator}`);
                        return null
                }
            }
            if (node.type == 'literal') {
                return node.value
            }
            if (node.type == 'ident') {
                if (this.pass == 1) {
                    const label = node.name
                    const lbl = this.labels.find(label);
                    if (!lbl) {
                        this.error(`Undefined label '${label}'`)
                        return null
                    }
                    // TODO can also be a constant
                    return lbl.addr
                }
                return 0
            }
        }
        return evalExpr(ast);
    }
    emit = (byte: number) => {
        this.binary.push(byte);
        this.codePC += 1
    }

    emit16 = (word: number) => {
        this.emit(word & 0xff);
        this.emit((word>>8) & 0xff);
    }

    // TODO shouldn't have any for opcode
    checkSingle = (opcode: number | null) => {
        if (opcode === null) {
            return false;
        }
        this.emit(opcode)
        return true;
    }

    checkImm = (param: any, opcode: number | null) => {
        if (opcode === null || param === null) {
            return false;
        }
        const val = this.evalExpr(param);
        if (val !== null) {
            if (val < 0 || val > 255) {
                return false
            }
            this.emit(opcode)
            this.emit(val)
            return true
        }
        return false;
    }

    checkAbs = (param: any, opcode: number | null, bits: number) => {
        if (opcode === null || param === null) {
            return false;
        }
        const val = this.evalExpr(param);
        if (val !== null) {
            if (val < 0 || val >= (1<<bits)) {
                return false
            }
            this.emit(opcode)
            if (bits === 8) {
                this.emit(val)
            } else {
                this.emit16(val)
            }
            return true
        }
        return false
    }

    checkBranch = (param: string, opcode: number | null) => {
        if (opcode === null || param === null) {
            return false;
        }
        if (this.pass === 0) {
            this.emit(0);
            this.emit(0);
        }
        const addr = this.evalExpr(param);
        this.emit(opcode);
        // TODO check 8-bit overflow here!!
        if (addr < (this.codePC - 0x600)) {  // Backwards?
          this.emit((0xff - ((this.codePC - 0x600) - addr)) & 0xff);
          return true;
        }
        this.emit((addr - (this.codePC - 0x600) - 1) & 0xff);
        return true;
      }

    checkDirectives = (cmd, arg) => {
        const tryIntArg = (emit) => {
            // TODO must handle list of bytes
            const v = this.evalExpr(arg);
            if (v === null) {
                this.error(`${cmd} must be followed by at least one argument`);
                return false
            }
            emit(v)
            return true
        }
        switch (cmd) {
            case "!byte": {
                return tryIntArg(this.emit)
            }
            case "!word": {
                return tryIntArg(this.emit16)
            }
            default:
                this.error(`Unknown directive ${cmd}`);
                return false
        }
    }

    assembleLine = ({line, lineNo}) => {
        this.currentLineNo = lineNo
        console.log(`pass ${this.pass} - assembling: ${line}`)

        let ast = parser.parse(line)

        if (ast.label !== null) {
            const lblSymbol = ast.label

            if (this.pass === 0) {
                const oldLabel = this.labels.find(lblSymbol)
                if (oldLabel === undefined) {
                    this.labels.add(lblSymbol, this.codePC, lineNo);
                } else {
                    this.error(`Label '${lblSymbol}' already defined on line ${oldLabel.lineNo}`)
                    return
                }
            }
        }


        // TODO
//        if (command[0] === '!') {
//            return this.checkDirectives(command, param);
//        }

        if (ast.insn === null) {
            return
        }

        const insn = ast.insn
        const op = opcodes[ast.insn.mnemonic.toUpperCase()]
        if (op !== undefined) {
            let noArgs = insn.imm === null && insn.abs === null
            if (noArgs && this.checkSingle(op[10])) {
                return true;
            }
            if (this.checkImm(insn.imm, op[0])) {
                return true;
            }
            if (this.checkAbs(insn.abs, op[1], 8)) {
                return true;
            }

/*
          if (checkZeroPageX(param, Opcodes[o][2])) { return true; }
          if (checkZeroPageY(param, Opcodes[o][3])) { return true; }
          if (checkAbsoluteX(param, Opcodes[o][5])) { return true; }
          if (checkAbsoluteY(param, Opcodes[o][6])) { return true; }
          if (checkIndirect(param, Opcodes[o][7])) { return true; }
          if (checkIndirectX(param, Opcodes[o][8])) { return true; }
          if (checkIndirectY(param, Opcodes[o][9])) { return true; }
*/
            if (this.checkAbs(insn.abs, op[4], 16)) {
                return true;
            }
            if (this.checkBranch(insn.abs, op[11])) {
                return true;
            }
        }
        console.log('error!');
    }

    assemble = (lines) => {
        const trim = (str) => {
            const commentRe = /^([^;]*).*$/
            const s = commentRe.exec(str)[1]
            return s.replace(/^\s+|\s+$/g, '')
        }

        function toSourceLine(str: String, lineIdx: number): SourceLine | null {
            const line = trim(str)
            if (line == '') {
                return null
            }
            return {
                line,
                lineNo: lineIdx+1
            }
        }
        const preprocessed = filterMap(lines, toSourceLine);

        this.emitBasicHeader()
        for (const line of preprocessed) {
            this.assembleLine(line);
        }
    }
}

function main() {
    const lastArg = process.argv[process.argv.length-1];
    const asm = new Assembler()
    const lines = readLines(lastArg)

    asm.startPass(0)
    asm.assemble(lines)
    asm.startPass(1)
    asm.assemble(lines)

    writeFileSync('test.prg', asm.prg(), null)
}

main();

//console.log(parser.parse('1+3'));
//console.log(parser.parse('1+( 1 + 3 ) / 2'));

/*
console.log(parser.parse(' lda #127 '));
console.log(parser.parse(' lda #foobar'));
console.log(parser.parse(' lda foobarr'));
console.log(parser.parse(' jmp jope'));
console.log(parser.parse(' inc $d020'));
*/
