
import opcodes from './opcodes'
import * as path from 'path'

import { readFileSync, writeFileSync } from 'fs'

var parser = require('./g_parser')

interface Loc {
    offset: number,
    line: number,
    column: number
}

interface SourceLoc {
    start: Loc,
    end: Loc,
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

interface StmtFillBytes {
    numBytes: any[];
    fillValue: any[];
    loc: SourceLoc;
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
    loc: SourceLoc
}

interface ExprVal {
    val: number | null;
    loc: SourceLoc;
}

class SeenLabels {
    seenLabels = new Map<string, LabelSym>();

    clear () {
        this.seenLabels.clear();
    }

    find = (name) => {
        return this.seenLabels.get(name);
    }

    declare = (name, sym) => {
        this.seenLabels.set(name, sym);
    }
}

class Labels {
    labels = {}
    macroCount = 0
    labelPrefix = []

    startPass(): void {
        this.macroCount = 0;
    }

    pushMacroExpandScope(macroName): void {
        this.labelPrefix.push(`${macroName}/${this.macroCount}/`)
        this.macroCount++;
    }

    popMacroExpandScope(): void {
        this.labelPrefix.pop();
    }

    currentScopePrefix(): string {
        if (this.labelPrefix.length === 0) {
            return ''
        }
        return this.labelPrefix.join('/');
    }

    prefixName(name: string): string {
        const prefix = this.currentScopePrefix();
        if (name[0] === '_') {
            return `${prefix}${name}`
        }
        return name
    }

    add(name: string, addr: number, loc: SourceLoc): void {
        const lbl: Label = {
            addr,
            loc
        }
        const prefixedName = this.prefixName(name)
        this.labels[prefixedName] = lbl
    }

    find(name: string):Label {
        return this.labels[this.prefixName(name)]
    }
}

interface LabelSym {
    name: string,
    loc: any
}

interface Macro {
    name: LabelSym,
    args: string[],
    body: any[];    // AST nodes (TODO types)
}

interface Constant {
    name: LabelSym,
    type: 'ref' | 'value',
    value: number | string
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

    find (name: string): S {
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

    includeStack: string[] = [];
    codePC = 0;
    pass = 0;
    needPass = false;
    seenLabels = new SeenLabels();
    labels = new Labels()
    macros = new SymbolTab<Macro>()
    constants = new ScopeStack<Constant>();
    errorList: Error[] = [];

    prg = () => {
      // 1,8 is for encoding the $0801 starting address in the .prg file
      return Buffer.from([1, 8].concat(this.binary))
    }

    peekSourceStack () {
        const len = this.includeStack.length;
        return this.includeStack[len-1];
    }

    pushSource (fname) {
        this.includeStack.push(fname);
    }

    popSource () {
        this.includeStack.pop();
    }

    anyErrors = () => this.errorList.length !== 0

    errors = () => {
        return this.errorList.map(({loc, msg}) => {
            let formatted = `<unknown>:1:1: error: ${msg}`
            if (loc) {
                formatted = `${loc.source}:${loc.start.line}:${loc.start.column}: error: ${msg}`
            }
            return {
                loc,
                msg,
                formatted
            }
        })
    }

    error = (err: string, loc: SourceLoc) => {
        this.errorList.push({
            loc,
            msg: err
        })
    }

    startPass = (pass: number) => {
      this.codePC = 0x801;
      this.pass = pass;
      this.needPass = false;
      this.binary = [];
      this.seenLabels.clear();
      this.labels.startPass();
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

        const offsetExpr = this.evalExpr(ast.offset);
        let offset = ast.offset !== null && offsetExpr ? offsetExpr.val : 0;
        const sizeExpr = this.evalExpr(ast.size);
        let size = ast.size !== null && sizeExpr ? sizeExpr.val : buf.byteLength - offset;

        if (offset === null || size === null) {
            return false;
        }

        // TODO buffer overflow
        for (let i = 0; i < size; i++) {
            this.emit(buf.readUInt8(i + offset));
        }
        return true
    }

    evalExpr (ast): ExprVal {
        const runBinop = (a, b, f) => {
            return {
                val: f(a.val, b.val),
                loc: a.loc // TODO combine a, b
            }
        }
        const evalExpr = (node) => {
            if (node.type === 'binary') {
                const left = evalExpr(node.left);
                const right = evalExpr(node.right);
                if (left === null || right === null) {
                    return null
                }
                switch (node.op) {
                    case '+': return  runBinop(left, right, (a,b) => a + b)
                    case '-': return  runBinop(left, right, (a,b) => a - b)
                    case '*': return  runBinop(left, right, (a,b) => a * b)
                    case '/': return  runBinop(left, right, (a,b) => a / b)
                    case '%': return  runBinop(left, right, (a,b) => a % b)
                    case '&': return  runBinop(left, right, (a,b) => a & b)
                    case '|': return  runBinop(left, right, (a,b) => a | b)
                    case '^': return  runBinop(left, right, (a,b) => a ^ b)
                    case '<<': return runBinop(left, right, (a,b) => a << b)
                    case '>>': return runBinop(left, right, (a,b) => a >> b)
                    case '==': return runBinop(left, right, (a,b) => a == b)
                    case '!=': return runBinop(left, right, (a,b) => a != b)
                    case '<':  return runBinop(left, right, (a,b) => a <  b)
                    case '<=': return runBinop(left, right, (a,b) => a <= b)
                    case '>':  return runBinop(left, right, (a,b) => a >  b)
                    case '>=': return runBinop(left, right, (a,b) => a >= b)
                    default:
                        throw new Error(`Unhandled binary operator ${node.op}`);
                }
            }
            if (node.type === 'UnaryExpression') {
                const { val, loc } = evalExpr(node.argument);
                switch (node.operator) {
                    case '-': return { val: -val, loc: node.loc };
                    case '~': return { val: ~val, loc: node.loc };
                    default:
                        throw new Error(`Unhandled unary operator ${node.op}`);
                }
            }
            if (node.type == 'literal') {
                return { val: node.value, loc: node.loc };
            }
            if (node.type == 'ident') {
                let label = node.name
                const constant = this.constants.find(label);
                if (constant) {
                    if (constant.type === 'value') {
                        return { val: constant.value, loc: node.loc };
                    }
                    // TODO name shadowing warning
                    label = constant.value;
                }

                const lbl = this.labels.find(label);
                if (!lbl) {
                    if (this.pass === 1) {
                        this.error(`Undefined symbol '${label}'`, node.loc)
                    }
                    this.needPass = true;
                    return null
                }
                return { val: lbl.addr, loc: lbl.loc } as ExprVal;
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
        const eres = this.evalExpr(param);
        if (eres !== null) {
            const { val, loc } = eres
            if (val < 0 || val > 255) {
                this.error(`Immediate evaluates to ${val} which cannot fit in 8 bits`, loc);
                return false
            }
            this.emit(opcode)
            this.emit(val)
            return true
        } else {
            if (this.pass === 0) {
                this.emit(opcode)
                this.emit(0)
                return true
            }
        }
        return false;
    }

    checkAbs = (param: any, opcode: number | null, bits: number) => {
        if (opcode === null || param === null) {
            return false;
        }
        const eres = this.evalExpr(param);
        if (eres !== null) {
            const { val, loc } = eres
            if (bits === 8) {
                if (val < 0 || val >= (1<<bits)) {
                    return false
                }
                this.emit(opcode)
                this.emit(val)
            } else {
                this.emit(opcode)
                this.emit16(val)
            }
            return true
        } else {
            if (bits === 8) {
                this.emit(opcode);
                this.emit(0);
                return true
            } else {
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
        const eres = this.evalExpr(param);
        this.emit(opcode);
        if (eres === null) {
            this.emit(0);
            return true;
        }
        const { val: addr, loc } = eres
        // TODO check 8-bit overflow here!!
        if (addr < (this.codePC - 0x600)) {  // Backwards?
          this.emit((0xff - ((this.codePC - 0x600) - addr)) & 0xff);
          return true;
        }
        this.emit((addr - (this.codePC - 0x600) - 1) & 0xff);
        return true;
      }

    setPC = (valueExpr) => {
        const eres = this.evalExpr(valueExpr);
        if (eres === null) {
            this.error(`Couldn't evaluate expression value`, eres.loc);
            return false
        }
        const { val, loc } = eres
        while (this.codePC < val) {
            this.emit(0);
        }
        return true
    }

    fileInclude = (ast) => {
        const fname = path.join(path.dirname(this.peekSourceStack()), ast.filename);
        const src = readFileSync(fname).toString();
        this.pushSource(fname);
        const res = this.assemble(src);
        this.popSource();
        return res;
    }

    fillBytes = (n: StmtFillBytes) => {
        const numVals   = this.evalExpr(n.numBytes);
        if (!numVals) {
            return false;
        }
        const fillValue = this.evalExpr(n.fillValue);
        if (!fillValue) {
            return false;
        }
        const fv = fillValue.val;
        if (fv < 0 || fv >= 256) {
            this.error(`!fill value to repeat must be in 8-bit range, '${fv}' given`, fillValue.loc);
            return false;
        }
        for (let i = 0; i < numVals.val; i++) {
            this.emit(fv);
        }
        return true;
    }

    evalListExpr = (listExpr) => {
        if (listExpr.type === 'list-range') {
            const start = this.evalExpr(listExpr.start);
            if (!start) {
                return null;
            }
            const end = this.evalExpr(listExpr.end);
            if (!end) {
                return null;
            }
            const startv = start.val
            const endv = end.val
            if (endv == startv) {
                return []
            }
            if (endv < startv) {
                this.error(`range(start, end) expression end must be greater than start, start=${startv}, end=${endv} given`, listExpr.loc)
                return null;
            }
            return Array(endv-startv).fill(null).map((_,idx) => idx + startv);
        }
        this.error(`ICE: unknown list expression type: ${listExpr.type}`, listExpr.loc);
        return null
    }

    withScope = (name, compileScope) => {
        this.pushConstantScope();
        this.labels.pushMacroExpandScope(name);
        const res = compileScope();
        this.labels.popMacroExpandScope();
        this.popConstantScope();
        return res;
    }

    checkDirectives = (ast) => {
        const tryIntArg = (exprList, bits) => {
            // TODO must handle list of bytes
            for (let i = 0; i < exprList.length; i++) {
                const eres = this.evalExpr(exprList[i]);
                if (eres === null && this.pass !== 0) {
                    // TODO what location to report here??  Probably there will be another error reported by evalExpr, so maybe no need for an error here?
                    this.error(`Couldn't evaluate expression value for data statement`, undefined);
                    return false
                }
                const { val } = eres
                if (bits === 8) {
                    this.emit(val);
                } else {
                    if (bits !== 16) {
                        throw new Error('impossible');
                    }
                    this.emit16(val);
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
            case 'fill': {
                const n: StmtFillBytes = ast
                return this.fillBytes(n);
            }
            case 'setpc': {
                return this.setPC(ast.pc);
            }
            case 'binary': {
                return this.emitBinary(ast);
            }
            case 'include': {
                return this.fileInclude(ast);
            }
            case 'if': {
                const { cond, trueBranch, falseBranch } = ast
                const eres = this.evalExpr(ast.cond);
                if (!eres) {
                    return false;
                }
                const { val: condVal } = eres
                if (isTrueVal(condVal)) {
                    return this.assembleStmtList(trueBranch);
                } else {
                    return this.assembleStmtList(falseBranch);
                }
                return true;
            }
            case 'for': {
                const { index, listExpr, body, loc } = ast
                const lst = this.evalListExpr(listExpr);
                if (!lst) {
                    return false;
                }

                return this.withScope('forloop', () => {
                    const loopVar: Constant = {
                        name: index,
                        type: 'value',
                        value: 0
                    };
                    this.constants.add(index.name, loopVar);

                    for (let i = 0; i < lst.length; i++) {
                        loopVar.value = lst[i];
                        if (!this.assembleStmtList(body)) {
                            return false;
                        }
                    }
                    return true;
                })
            }
            case 'macro': {
                // No need to deal with sticking macros into the symbol table in the later
                // passes because we only register its body AST.
                if (this.pass === 0) {
                    const { name, args, body } = ast;
                    // TODO check for duplicate arg names!
                    const prevMacro = this.macros.find(name.name);
                    if (prevMacro !== undefined) {
                        // TODO previous declaration from prevMacro
                        this.error(`Macro '${name}' already defined`, name.loc);
                        return false;
                    }
                    this.macros.add(name.name, { name, args, body });
                }
                return true;
            }
            case 'callmacro': {
                let argValues = [];
                const { name, args } = ast;
                const macro = this.macros.find(name.name);

                if (!macro) {
                    if (this.pass === 0) {
                        this.error(`Undefined macro '${name.name}'`, name.loc);
                    }
                    return false;
                }
                if (macro.args.length !== args.length) {
                    if (this.pass === 0) {
                        this.error(`Macro '${name.name}' declared with ${macro.args.length} args but called here with ${args.length}`,
                            name.loc);
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
                                const arg = macro.args[argIdx];
                                this.error(`Must pass an identifer for macro '${name.name}' argument '${arg.name}' (call-by-reference argument)`, arg.loc);
                            }
                            return false;
                        }
                        argValues.push({type: 'ref', value: arg.name});
                    } else {
                        // pass by value, so evaluate
                        const eres = this.evalExpr(args[argIdx]);
                        argValues.push({
                            type: 'value',
                            value: eres === null ? 0 : eres.val
                        });
                    }
                }
                return this.withScope(name, () => {
                    for (let argIdx = 0; argIdx < argValues.length; argIdx++) {
                        const argName = macro.args[argIdx];
                        this.constants.add(argName.name, {
                            name: argName,
                            type: argValues[argIdx].type,
                            value: argValues[argIdx].value
                        });
                    }
                    return this.assembleStmtList(macro.body);
                })
            }
            case 'equ': {
                const name = ast.name;
                const prevConstant = this.constants.find(name);
                if (prevConstant) {
                    if (this.pass === 0) {
                        this.error(`Constant ${name} already defined`, ast.loc);
                    }
                    return false;
                }
                const eres = this.evalExpr(ast.value);
                if (eres === null) {
                    return false;
                }
                this.constants.add(name, {
                    name,
                    type: 'value',
                    value: eres.val
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

        if (line.label !== null) {
            let lblSymbol = line.label;
            const constant = this.constants.find(line.label.name);
            // If there's a label 'ref' in the constants table, rewrite the current line's
            // label name to that.  This is used for passing label names via macro parameters.
            if (constant) {
                if (constant.type === 'ref') {
                    lblSymbol = {
                        ...lblSymbol,
                        name: constant.value
                    };
                }
            }

            const seenSymbol = this.seenLabels.find(this.labels.prefixName(lblSymbol.name));
            if (seenSymbol) {
                this.error(`Label '${seenSymbol.name}' already defined`, lblSymbol.loc);
                // this.note
                // on line ${lineNo}`)
                return false;
            } else {
                const lblName = lblSymbol.name;
                this.seenLabels.declare(this.labels.prefixName(lblName), lblSymbol);
                const oldLabel = this.labels.find(lblName);
                if (oldLabel === undefined) {
                    this.labels.add(lblName, this.codePC, lblSymbol.loc);
                } else {
                    // If label address has changed change, need one more pass
                    if (oldLabel.addr !== this.codePC) {
                        this.needPass = true;
                        this.labels.add(lblName, this.codePC, lblSymbol.loc);
                    }
                }
            }
        }

        if (line.scopedStmts) {
            return this.withScope(line.label, () => {
                return this.assembleStmtList(line.scopedStmts);
            })
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

            if (this.checkAbs(insn.absx, op[2], 8)) {
                return true;
            }
            if (this.checkAbs(insn.absy, op[3], 8)) {
                return true;
            }

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

            if (this.checkAbs(insn.indx, op[8], 8)) {
                return true;
            }
            if (this.checkAbs(insn.indy, op[9], 8)) {
                return true;
            }

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
        try {
            const statements = parser.parse(source, {
                source: this.peekSourceStack()
            });
            return this.assembleStmtList(statements);
        } catch(err) {
            if ('name' in err && err.name == 'SyntaxError') {
                this.error(`Syntax error: ${err.message}`, {
                    ...err.location,
                    source: this.peekSourceStack()
                })
                return false;
            }
            console.error('Internal compiler error.', err);
            return false;
        }
    }
}

export function assemble(filename) {
    const asm = new Assembler();
    const src = readFileSync(filename).toString();
    asm.pushSource(filename);

    let pass = 0;
    do {
        asm.pushConstantScope();
        asm.startPass(pass);
        if (!asm.assemble(src)) {
            // Ddin't get an error but returned anyway?  Add ICE
            if (!asm.anyErrors()) {
                asm.error('Internal compiler error x.', undefined)
            }
            return {
                errors: asm.errors()
            }
        }
        asm.popConstantScope();
        const maxPass = 10;
        if (pass > maxPass) {
            console.error(`Exceeded max pass limit ${maxPass}`);
            return;
        }
        pass += 1;
    } while(asm.needPass && !asm.anyErrors());

    asm.popSource();

    return {
        prg: asm.prg(),
        errors: asm.errors()
    }
}
