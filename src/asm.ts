
import opcodes from './opcodes'

import { readFileSync, writeFileSync } from 'fs'

var parser = require('./g_parser')

interface SourceLine {
    lineNo: number,
    line: string
}

interface SourceLoc {
    lineNo: number,
    source: string
}

interface Error {
    loc: SourceLoc,
    msg: string
}

interface StmtEmitBytes {
    type: "byte" | "word";
    values: any[];
}

interface Stmt {
    type: string,
}

interface LineAst {
    label: string | null,
    stmt: Stmt | null
}

function toHex16(v: number): string {
    return v.toString(16).padStart(4, '0');
}

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

interface Macro {
    name: string,
    args: string[],
    body: any[];    // AST nodes (TODO types)
}

interface Constant {
    name: string,
    type: 'ref' | 'value',
    value: number | string  // TODO symbol interface
}

class SymbolTab<S> {
    symbols: Map<string, S> = new Map();

    add = (name: string, s: S) => {
        this.symbols[name] = s
    }

    find = (name: string) => {
        return this.symbols[name]
    }
}

class ScopeStack<S> {
    stack: SymbolTab<S>[] = [];

    push = () => {
        this.stack.push(new SymbolTab<S>());
    }

    pop = () => {
        this.stack.pop();
    }

    find = (name: string) => {
        const last = this.stack.length-1;
        for (let idx = last; idx >= 0; idx--) {
            const elt = this.stack[idx].find(name);
            if (elt) {
                return elt;
            }
        }
        return undefined;
    }

    add = (name: string, sym: S) => {
        const last = this.stack.length-1;
        this.stack[last].add(name, sym);
    }
}

function isTrueVal(cond: number | boolean): boolean {
    return (cond === true || cond != 0);
}

class Assembler {
    // TODO this should be a resizable array instead
    binary: number[] = [];

    currentLineNo = 0;
    codePC = 0;
    pass = 0;
    labels = new Labels()
    macros = new SymbolTab<Macro>()
    constants = new ScopeStack<Constant>();
    errorList: Error[] = [];

    prg = () => {
      // 1,8 is for encoding the $0801 starting address in the .prg file
      return Buffer.from([1, 8].concat(this.binary))
    }

    errors = () => {
        return this.errorList.map(({loc, msg}) => {
            return `${loc.source}:${loc.lineNo} - ${msg}`
        })
    }

    error = (err: string) => {
        const loc = { lineNo: 1, source: 'foo.asm' };
        this.errorList.push({
            loc,
            msg: err
        })
    }

    startPass = (pass: number) => {
      this.codePC = 0x801;
      this.pass = pass;
      this.binary = [];
    }

    pushConstantScope = () => {
        this.constants.push();
    }

    popConstantScope = () => {
        this.constants.pop();
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

    emitBinary = (ast) => {
        const { filename } = ast
        const buf: Buffer = readFileSync(filename)

        let offset = ast.offset !== null ? this.evalExpr(ast.offset) : 0;
        let size = ast.size !== null ? this.evalExpr(ast.size) : buf.byteLength - offset;

        if (offset === null || size === null) {
            return false;
        }

        // TODO buffer overflow
        for (let i = 0; i < size; i++) {
            this.emit(buf.readUInt8(i + offset));
        }
        return true
    }

    evalExpr = (ast, mustResolveFirstPass = false) => {
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
                    case '==': return left == right
                    case '!=': return left != right
                    case '<': return left < right
                    case '<=': return left <= right
                    case '>': return left > right
                    case '>=': return left >= right
                    default:
                        throw new Error(`Unhandled binary operator ${node.op}`);
                }
            }
            if (node.type === 'UnaryExpression') {
                const arg = evalExpr(node.argument);
                switch (node.operator) {
                    case '-': return -arg
                    case '~': return ~arg
                    default:
                        throw new Error(`Unhandled unary operator ${node.op}`);
                }
            }
            if (node.type == 'literal') {
                return node.value
            }
            if (node.type == 'ident') {
                let label = node.name
                const constant = this.constants.find(label);
                if (constant) {
                    if (constant.type === 'value') {
                        return constant.value;
                    }
                    // TODO name shadowing warning
                    label = constant.value;
                }

                const lbl = this.labels.find(label);
                if (!lbl) {
                    if (mustResolveFirstPass || this.pass === 1) {
                        this.error(`Undefined symbol '${label}'`)
                    }
                    return null
                }
                return lbl.addr
            }
            throw new Error(`don't know what to do with node ${node}`)
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
                this.error(`Immediate evaluates to ${val} which cannot fit in 8 bits`);
                return false
            }
            this.emit(opcode)
            this.emit(val)
            return true
        } else {
            if (this.pass === 0) {
                this.emit(opcode)
                this.emit(val)
                return true
            }
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
        } else {
            // Don't encode a 8-bit forward reference in first pass but
            // fall-back to conservative 16-bits.
            //
            // TODO there's a bug here.  If we emitted a 16-bit value in the
            // first pass and realize we could do it in 8-bits in the second
            // pass, the above code will encode the value as 8-bit, breaking
            // label references that were gathered from pass 1.
            if (bits == 16) {
                this.emit(opcode);
                this.emit16(0);
                return true
            }
        }
        return false
    }

    checkBranch = (param: any, opcode: number | null) => {
        if (opcode === null || param === null) {
            return false;
        }
        if (this.pass === 0) {
            this.emit(0);
            this.emit(0);
            return true;
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

    setPC = (valueExpr) => {
        const v = this.evalExpr(valueExpr);
        if (v === null) {
            this.error(`Couldn't evaluate expression value`);
            return false
        }
        while (this.codePC < v) {
            this.emit(0);
        }
        return true
}

    checkDirectives = (ast) => {
        const tryIntArg = (exprList, bits) => {
            // TODO must handle list of bytes
            for (let i = 0; i < exprList.length; i++) {
                const v = this.evalExpr(exprList[i]);
                if (v === null && this.pass != 0) {
                    this.error(`Couldn't evaluate expression value for data statement`);
                    return false
                }
                if (bits === 8) {
                    this.emit(v);
                } else {
                    if (bits !== 16) {
                        throw new Error('impossible');
                    }
                    this.emit16(v);
                }
            }
            return true
        }
        switch (ast.type) {
            case 'byte':
            case 'word': {
                const emitNode: StmtEmitBytes = ast
                return tryIntArg(emitNode.values, ast.type === 'byte' ? 8 : 16);
            }
            case 'setpc': {
                return this.setPC(ast.pc);
            }
            case 'binary': {
                return this.emitBinary(ast);
            }
            case 'if': {
                const { cond, trueBranch, falseBranch } = ast
                const condVal = this.evalExpr(ast.cond, true);
                if (isTrueVal(condVal)) {
                    return this.assembleStmtList(trueBranch);
                } else {
                    return this.assembleStmtList(falseBranch);
                }
                return true;
            }
            case 'macro': {
                // No need to deal with sticking macros into the symbol table in the later
                // passes because we only register its body AST.
                if (this.pass === 0) {
                    const { name, args, body } = ast;
                    // TODO check for duplicate arg names!
                    if (this.macros.find(name) !== undefined) {
                        this.error(`Macro '${name}' already defined on line XXX TODO`)
                        return false;
                    }
                    this.macros.add(name, {name, args, body });
                }
                return true;
            }
            case 'callmacro': {
                let argValues = [];
                const { name, args } = ast;
                const macro = this.macros.find(name);

                if (!macro) {
                    if (this.pass === 0) {
                        this.error(`Undefined macro '${name}'`);
                    }
                    return false;
                }
                if (macro.args.length !== args.length) {
                    if (this.pass === 0) {
                        this.error(`Macro '${name}' declared with ${macro.args.length} args but called here with ${args.length}`);
                    }
                    return false;
                }

                for (let argIdx = 0; argIdx < macro.args.length; argIdx++) {
                    const argType = macro.args[argIdx].type;
                    const arg = args[argIdx];
                    if (argType === 'ref') {
                        // pass by named reference
                        if (arg.type !== 'ident') {
                            if (this.pass === 0) {
                                this.error(`Must pass an identifer for macro '${name}' argument '${macro.args[argIdx].name}' (call-by-reference argument)`);
                            }
                            return false;
                        }
                        argValues.push({type: 'ref', value: arg.name});
                    } else {
                        // pass by value, so evaluate
                        const value = this.evalExpr(args[argIdx]);
                        if (value === null) {
                            return false;
                        }
                        argValues.push({
                            type: 'value',
                            value
                        });
                    }
                }
                this.pushConstantScope();
                for (let argIdx = 0; argIdx < argValues.length; argIdx++) {
                    const argName = macro.args[argIdx];
                    this.constants.add(argName.name, {
                        name: argName,
                        type: argValues[argIdx].type,
                        value: argValues[argIdx].value
                    });
                }
                const res = this.assembleStmtList(macro.body);
                this.popConstantScope();
                return res;
            }
            case 'equ': {
                const name = ast.name;
                const prevConstant = this.constants.find(name);
                if (prevConstant) {
                    if (this.pass === 0) {
                        this.error(`Constant ${name} already defined`);
                    }
                    return false;
                }
                const value = this.evalExpr(ast.value, true);
                if (value === null) {
                    return false;
                }
                this.constants.add(name, {
                    name,
                    type: 'value',
                    value
                });
                return true;
            }
            default:
                throw new Error(`unknown directive ${ast.type}`)
        }
    }

    assembleStmtList = (lst) => {
        if (lst === null) {
            return true;
        }
        for (let i = 0; i < lst.length; i++) {
            if (!this.assembleLine(lst[i])) {
                return false;
            }
        }
        return true
}

    assembleLine = (line) => {
        // Empty lines are no-ops
        if (line === null) {
            return true;
        }

        const lineNo = 13 // TODO stick this in stmt in parser
        this.currentLineNo = lineNo;

        if (line.label !== null) {
            const lblSymbol = line.label

            if (this.pass === 0) {
                const oldLabel = this.labels.find(lblSymbol)
                if (oldLabel === undefined) {
                    this.labels.add(lblSymbol, this.codePC, lineNo);
                } else {
                    // TODO if any labels changed value in non-zero pass, we need
                    // one more pass over the source.
                    this.error(`Label '${lblSymbol}' already defined on line ${oldLabel.lineNo}`)
                    return false;
                }
            }
        }

        if (line.stmt === null) {
            return true
        }

        if (line.stmt.type !== 'insn') {
            return this.checkDirectives(line.stmt);
        }

        const stmt = line.stmt
        const insn = stmt.insn
        const op = opcodes[insn.mnemonic.toUpperCase()]
        if (op !== undefined) {
            let noArgs =
                insn.imm === null
                && insn.abs === null
                && insn.absx === null
                && insn.absy === null
                && insn.absind === null
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
*/
            if (this.checkAbs(insn.absx, op[5], 16)) {
                return true;
            }
            if (this.checkAbs(insn.absy, op[6], 16)) {
                return true;
            }
            // Absolute indirect
            if (this.checkAbs(insn.absind, op[7], 16)) {
                return true;
            }
/*
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
        return false;
    }

    assemble = (source) => {
        const statements = parser.parse(source);
        return this.assembleStmtList(statements);
    }
}

export function assemble(filename) {
    const asm = new Assembler();
    const src = readFileSync(filename).toString();

    asm.pushConstantScope();

    asm.startPass(0);
    if (!asm.assemble(src)) {
        return {
            errors: asm.errors()
        }
    }
    asm.popConstantScope();

    asm.pushConstantScope();
    asm.startPass(1);
    asm.assemble(src);
    asm.popConstantScope();

    return {
        prg: asm.prg(),
        errors: asm.errors()
    }
}
