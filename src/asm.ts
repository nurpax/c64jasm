
import opcodes from './opcodes'
import * as path from 'path'

import { readFileSync, writeFileSync } from 'fs'
import * as ast from './ast'
import { Loc, SourceLoc } from './ast'

var parser = require('./g_parser')

interface Error {
    loc: SourceLoc,
    msg: string
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

class SeenLabels {
    seenLabels = new Map<string, ast.Label>();

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

    find(name: string): Label {
        return this.labels[this.prefixName(name)]
    }
}

interface Constant {
    arg: ast.MacroArg,
    value: any
}

class SymbolTab<S> {
    symbols: Map<string, S> = new Map();

    add = (name: string, s: S) => {
        this.symbols[name] = s
    }

    find (name: string): S {
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
    macros = new SymbolTab<ast.StmtMacro>()
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
        let offset = ast.offset !== null && offsetExpr ? offsetExpr.lit : 0;
        const sizeExpr = this.evalExpr(ast.size);
        let size = ast.size !== null && sizeExpr ? sizeExpr.lit : buf.byteLength - offset;

        if (offset === null || size === null) {
            return false;
        }

        // TODO buffer overflow
        for (let i = 0; i < size; i++) {
            this.emit(buf.readUInt8(i + offset));
        }
        return true
    }

    evalExpr (astNode) {
        const runBinop = (a: ast.Literal, b: ast.Literal, f) => {
            // TODO combine a&b locs
            // TODO a.type, b.type must be literal
            return ast.mkLiteral(f(a.lit, b.lit), a.loc);
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
                const { lit, loc } = evalExpr(node.argument);
                switch (node.operator) {
                    case '-': return ast.mkLiteral(-lit, node.loc);
                    case '~': return ast.mkLiteral(~lit, node.loc);
                    default:
                        throw new Error(`Unhandled unary operator ${node.op}`);
                }
            }
            if (node.type == 'literal') {
                return node;
            }
            if (node.type == 'array') {
                return node;
            }
            if (node.type == 'ident') {
                let label = node.name
                const constant = this.constants.find(label);
                if (constant) {
                    if (constant.arg.type === 'value') {
                        return constant.value;
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
                return ast.mkLiteral(lbl.addr, lbl.loc);
            }
            if (node.type == 'member') {
                function findObjectField(props, prop) {
                    for (let pi = 0; pi < props.length; pi++) {
                        const p = props[pi]
                        // TODO THIS IS SUPER MESSY!! and doesn't handle errors
                        if (typeof prop == 'object') {
                            if (p.key === prop.lit) {
                                return p.val
                            }
                        } else {
                            if (p.key === prop) {
                                return p.val;
                            }
                        }
                    }
                }
                const object = this.evalExpr(node.object);
                if (!object) {
                    return null;
                }
                const { property, computed } = node
                if (!computed) {
                    if (object.type !== 'object') {
                        this.error(`The dot . operator can only operate on objects. Got ${object.type}.`, node.loc)
                        return null;
                    }
                    const elt = findObjectField(object.props, property);
                    if (elt) {
                        return elt;
                    }
                    this.error(`Object has no property named '${property}'`, node.loc)
                    return null
                } else {
                    const idx = this.evalExpr(node.property);
                    if (object.type === 'array') {
                        return this.evalExpr(object.values[idx.lit]);
                    } else if (object.type === 'object') {
                        const elt = findObjectField(object.props, idx);
                        if (elt) {
                            return elt;
                        }
                        this.error(`Object has no property named '${property}'`, node.loc)
                        return null
                    }
                    this.error('Cannot index a non-array object', node.loc)
                    return null;
                }
            }
            if (node.type == 'callfunc') {
                const sym = this.constants.find(node.name);
                if (!sym) {
                    this.error(`Calling an unknown function '${node.name}'`, node.loc);
                    return null;
                }
                if (sym.arg.type != 'value') {
                    this.error(`Cannot call with a macro argument reference.`, node.loc);
                    return null;
                }
                const callee = sym.value;
                if (callee.type !== 'function') {
                    this.error(`Callee must be a function type.  Got '${callee.type}'`, node.loc);
                    return null;
                }
                const argValues = [];
                for (let argIdx = 0; argIdx < node.args.length; argIdx++) {
                    const e = this.evalExpr(node.args[argIdx]);
                    if (!e) {
                        return null;
                    }
                    argValues.push(e);
                }
                return callee.func(argValues);
            }
            throw new Error(`don't know what to do with node '${node.type}'`)
        }
        return evalExpr(astNode);
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
            const { lit, loc } = eres
            if (lit < 0 || lit > 255) {
                this.error(`Immediate evaluates to ${lit} which cannot fit in 8 bits`, loc);
                return false
            }
            this.emit(opcode)
            this.emit(lit)
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
            const { lit, loc } = eres
            if (bits === 8) {
                if (lit < 0 || lit >= (1<<bits)) {
                    return false
                }
                this.emit(opcode)
                this.emit(lit)
            } else {
                this.emit(opcode)
                this.emit16(lit)
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
        const { lit: addr, loc } = eres
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
        const { lit, loc } = eres
        while (this.codePC < lit) {
            this.emit(0);
        }
        return true
    }

    fileInclude = (inclStmt: ast.StmtInclude) => {
        const fname = path.join(path.dirname(this.peekSourceStack()), inclStmt.filename);
        const src = readFileSync(fname).toString();
        this.pushSource(fname);
        const res = this.assemble(src);
        this.popSource();
        return res;
    }

    fillBytes = (n: ast.StmtFill) => {
        const numVals = this.evalExpr(n.numBytes);
        if (!numVals) {
            return false;
        }
        const fillValue = this.evalExpr(n.fillValue);
        if (!fillValue) {
            return false;
        }
        const fv = fillValue.lit;
        if (fv < 0 || fv >= 256) {
            this.error(`!fill value to repeat must be in 8-bit range, '${fv}' given`, fillValue.loc);
            return false;
        }
        for (let i = 0; i < numVals.lit; i++) {
            this.emit(fv);
        }
        return true;
    }

    withScope = (name, compileScope) => {
        this.pushConstantScope();
        this.labels.pushMacroExpandScope(name);
        const res = compileScope();
        this.labels.popMacroExpandScope();
        this.popConstantScope();
        return res;
    }

    checkDirectives = (node: ast.Stmt) => {
        const tryIntArg = (exprList, bits) => {
            // TODO must handle list of bytes
            for (let i = 0; i < exprList.length; i++) {
                const eres = this.evalExpr(exprList[i]);
                if (eres === null && this.pass !== 0) {
                    // TODO what location to report here??  Probably there will be another error reported by evalExpr, so maybe no need for an error here?
                    this.error(`Couldn't evaluate expression value for data statement`, undefined);
                    return false
                }
                const { lit } = eres
                if (bits === 8) {
                    this.emit(lit);
                } else {
                    if (bits !== 16) {
                        throw new Error('impossible');
                    }
                    this.emit16(lit);
                }
            }
            return true
        }
        switch (node.type) {
            case 'data': {
                return tryIntArg(node.values, node.dataSize === ast.DataSize.Byte ? 8 : 16);
            }
            case 'fill': {
                return this.fillBytes(node);
            }
            case 'setpc': {
                return this.setPC(node.pc);
            }
            case 'binary': {
                return this.emitBinary(node);
            }
            case 'include': {
                return this.fileInclude(node);
            }
            case 'if': {
                const { cond, trueBranch, falseBranch } = node
                const eres = this.evalExpr(node.cond);
                if (!eres) {
                    return false;
                }
                const { lit: condVal } = eres
                if (isTrueVal(condVal)) {
                    return this.assembleStmtList(trueBranch);
                } else {
                    return this.assembleStmtList(falseBranch);
                }
                return true;
            }
            case 'for': {
                const { index, list, body, loc } = node
                const lst: any = this.evalExpr(list);
                if (!lst) {
                    return false;
                }

                return this.withScope('forloop', () => {
                    const loopVar: Constant = {
                        arg: ast.mkMacroArg('value', index),
                        value: ast.mkLiteral(0, null)
                    };
                    this.constants.add(index.name, loopVar);

                    const elts = lst.values
                    for (let i = 0; i < elts.length; i++) {
                        const val = this.evalExpr(elts[i])
                        loopVar.value = val;
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
                    const { name, args, body } = node;
                    // TODO check for duplicate arg names!
                    const prevMacro = this.macros.find(name.name);
                    if (prevMacro !== undefined) {
                        // TODO previous declaration from prevMacro
                        this.error(`Macro '${name}' already defined`, name.loc);
                        return false;
                    }
                    this.macros.add(name.name, node);
                }
                return true;
            }
            case 'callmacro': {
                let argValues = [];
                const { name, args } = node;
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
                                const arg = macro.args[argIdx].ident;
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
                            value: eres
                        });
                    }
                }
                return this.withScope(name, () => {
                    for (let argIdx = 0; argIdx < argValues.length; argIdx++) {
                        const argName = macro.args[argIdx].ident;
                        this.constants.add(argName.name, {
                            arg: { ident: argName, type: argValues[argIdx].type},
                            value: argValues[argIdx].value
                        });
                    }
                    return this.assembleStmtList(macro.body);
                })
            }
            case 'equ': {
                const name = node.name;
                const prevConstant = this.constants.find(name.name);
                if (prevConstant) {
                    if (this.pass === 0) {
                        this.error(`Constant ${name.name} already defined`, node.loc);
                    }
                    return false;
                }
                const eres = this.evalExpr(node.value);
                if (eres === null) {
                    return false;
                }
                this.constants.add(name.name, {
                    arg: { ident: name, type: 'value' },
                    value: eres
                });
                return true;
            }
            default:
                throw new Error(`unknown directive ${node.type}`)
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
                if (constant.arg.type === 'ref') {
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

    registerPlugins () {
        const json = {
            type: 'function',
            func: args => {
                const name = args[0].lit;
                const curSource = this.peekSourceStack();
                const fname = path.join(path.dirname(curSource), name);
                return ast.objectToAst(JSON.parse(readFileSync(fname, 'utf-8')), null);
            }
        };
        const range = {
            type: 'function',
            func: args => {
                let start = 0;
                let end = undefined;
                if (args.length == 1) {
                    end = args[0].lit
                } else if (args.length == 2) {
                    start = args[0].lit
                    end = args[1].lit
                } else {
                    // TODO errors reporting via a context parameter
                    return null;
                }
                if (end == start) {
                    return ast.objectToAst([], null);
                }
                if (end < start) {
                    this.error(`range(start, end) expression end must be greater than start, start=${start}, end=${end} given`, null)
                    return null;
                }
                return ast.objectToAst(
                    Array(end-start).fill(null).map((_,idx) => idx + start),
                    null
                )
            }
        };
        const addPlugin = (name, handler) => {
            this.constants.add(name, {
                arg: {
                    type: 'value',
                    ident: ast.mkIdent(name, null) // TODO loc?
                },
                value: handler
            })
        }
        addPlugin('loadJson', json);
        addPlugin('range', range);
    }
}

export function assemble(filename) {
    const asm = new Assembler();
    const src = readFileSync(filename).toString();
    asm.pushSource(filename);

    asm.pushConstantScope();
    asm.registerPlugins();

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

    asm.popConstantScope();
    asm.popSource();

    return {
        prg: asm.prg(),
        errors: asm.errors()
    }
}
