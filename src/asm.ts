
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

    makeScopePrefix(maxDepth): string {
        if (this.labelPrefix.length === 0) {
            return ''
        }
        return this.labelPrefix.slice(0, maxDepth).join('/');
    }

    currentScopePrefix(): string {
        return this.makeScopePrefix(this.labelPrefix.length)
    }

    currentPrefixName(name: string): string {
        const prefix = this.currentScopePrefix();
        return `${prefix}${name}`
    }

    prefixName(name: string, depth): string {
        const prefix = this.makeScopePrefix(depth);
        return `${prefix}${name}`
    }

    add(name: string, addr: number, loc: SourceLoc): void {
        const lbl: Label = {
            addr,
            loc
        }
        const prefixedName = this.currentPrefixName(name);
        this.labels[prefixedName] = lbl
    }

    find(name: string): Label {
        const scopeDepth = this.labelPrefix.length;
        if (scopeDepth == 0) {
            return this.labels[name];
        }
        for (let depth = scopeDepth; depth >= 0; depth--) {
            const pn = this.prefixName(name, depth);
            const lbl = this.labels[pn];
            if (lbl) {
                return lbl;
            }
        }
        return undefined;
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

    find (name: string): S | undefined {
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

class Scopes {
    labels = new Labels();
    seenLabels = new SeenLabels();
    macros = new ScopeStack<ast.StmtMacro>();

    constructor () {
        this.macros.push();
    }

    startPass(): void {
        this.labels.startPass();
        this.seenLabels.clear();
    }

    pushMacroExpandScope(macroName): void {
        this.labels.pushMacroExpandScope(macroName);
    }

    popMacroExpandScope(): void {
        this.labels.popMacroExpandScope();
    }

    findMacro(name: string): ast.StmtMacro | undefined {
        return this.macros.find(name);
    }

    addMacro(name: string, macro: ast.StmtMacro): void {
        return this.macros.add(name, macro);
    }

    addLabel(name: string, addr: number, loc: SourceLoc): void {
        this.labels.add(name, addr, loc);
    }

    findLabel(name: string): Label {
        return this.labels.find(name);
    }

    findSeenLabel(name: string): ast.Label {
        return this.seenLabels.find(this.labels.currentPrefixName(name));
    }

    declareLabelSymbol(symbol: ast.Label, codePC: number): boolean {
        const { name, loc } = symbol
        this.seenLabels.declare(this.labels.currentPrefixName(name), symbol);
        const oldLabel = this.labels.find(name);
        if (oldLabel === undefined) {
            this.addLabel(name, codePC, loc);
            return false;
        }
        // If label address has changed change, need one more pass
        if (oldLabel.addr !== codePC) {
            this.addLabel(name, codePC, loc);
            return true;
        }
        return false;
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
    scopes = new Scopes();
    variables = new ScopeStack<Constant>();
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

    addError (msg: string, loc: SourceLoc): void {
        this.errorList.push({ msg, loc });
    }

    error (msg: string, loc: SourceLoc): never {
        this.addError(msg, loc);
        const err = new Error('Compilation failed');
        err.name = 'semantic';
        throw err;
    }

    startPass = (pass: number) => {
      this.codePC = 0x801;
      this.pass = pass;
      this.needPass = false;
      this.binary = [];
      this.scopes.startPass();
    }

    pushVariableScope = () => {
        this.scopes.macros.push();
        this.variables.push();
    }

    popVariableScope = () => {
        this.variables.pop();
        this.scopes.macros.pop();
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
        const fname = this.makeSourceRelativePath(filename)
        const buf: Buffer = readFileSync(fname)

        let offset = 0
        let size = buf.byteLength
        if (ast.size) {
            if (ast.offset !== null) {
                const offsetExpr = this.evalExpr(ast.offset);
                offset = offsetExpr ? offsetExpr.lit : 0;
            }
            if (ast.size !== null) {
                const sizeExpr = this.evalExpr(ast.size);
                size = sizeExpr ? sizeExpr.lit : buf.byteLength - offset;
            }
        }
        // TODO buffer overflow
        for (let i = 0; i < size; i++) {
            this.emit(buf.readUInt8(i + offset));
        }
        return true
    }

    evalExpr (astNode): ast.Expr {
        const runBinop = (a: ast.Literal, b: ast.Literal, f) => {
            // TODO combine a&b locs
            // TODO a.type, b.type must be literal
            return ast.mkLiteral(f(a.lit, b.lit), a.loc);
        }
        const evalExpr = (node) => {
            if (node.type === 'binary') {
                const left = evalExpr(node.left);
                const right = evalExpr(node.right);
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
                // TODO should eval the contents here?
                return node;
            }
            if (node.type == 'ident') {
                let label = node.name
                const variable = this.variables.find(label);
                if (variable) {
                    if (variable.value) {
                        return variable.value;
                    }
                    // Return something that we can continue compilation with in case this
                    // is a legit forward reference.
                    if (this.pass == 0) {
                        return ast.mkLiteral(0, node.name.loc);
                    }
                    this.error(`Couldn't resolve value for identifier '${label}'`, node.name.loc);
                }
                const lbl = this.scopes.findLabel(label);
                if (!lbl) {
                    if (this.pass === 1) {
                        this.error(`Undefined symbol '${label}'`, node.loc)
                    }
                    // Return a placeholder that should be resolved in the next pass
                    this.needPass = true;
                    return ast.mkLiteral(0, node.loc);
                }
                return ast.mkLiteral(lbl.addr, lbl.loc);
            }
            if (node.type == 'member') {
                const findObjectField = (props, prop) => {
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
                const { property, computed } = node
                if (!computed) {
                    if (object.type !== 'object') {
                        this.error(`The dot . operator can only operate on objects. Got ${object.type}.`, node.loc)
                    }
                    const elt = findObjectField(object.props, property);
                    if (elt) {
                        return elt;
                    }
                    this.error(`Object has no property named '${property}'`, node.loc)
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
                    }
                    this.error('Cannot index a non-array object', node.loc)
                }
            }
            if (node.type == 'callfunc') {
                const sym = this.variables.find(node.name);
                if (!sym) {
                    this.error(`Calling an unknown function '${node.name}'`, node.loc);
                }
                const callee = sym.value;
                if (callee.type !== 'function') {
                    this.error(`Callee must be a function type.  Got '${callee.type}'`, node.loc);
                }
                const argValues = [];
                for (let argIdx = 0; argIdx < node.args.length; argIdx++) {
                    const e = this.evalExpr(node.args[argIdx]);
                    argValues.push(e);
                }
                return callee.func(argValues);
            }
            this.error(`Don't know what to do with node '${node.type}'`, node.loc);
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
        const { lit } = this.evalExpr(valueExpr);
        while (this.codePC < lit) {
            this.emit(0);
        }
        return true
    }

    fileInclude = (inclStmt: ast.StmtInclude) => {
        const fname = this.makeSourceRelativePath(inclStmt.filename);
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
        }
        for (let i = 0; i < numVals.lit; i++) {
            this.emit(fv);
        }
        return true;
    }

    withScope = (name: string, compileScope) => {
        this.pushVariableScope();
        this.scopes.pushMacroExpandScope(name);
        const res = compileScope();
        this.scopes.popMacroExpandScope();
        this.popVariableScope();
        return res;
    }

    checkDirectives (node: ast.Stmt): void {
        const tryIntArg = (exprList, bits) => {
            // TODO must handle list of bytes
            for (let i = 0; i < exprList.length; i++) {
                const { lit } = this.evalExpr(exprList[i]);
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
                tryIntArg(node.values, node.dataSize === ast.DataSize.Byte ? 8 : 16);
                break;
            }
            case 'fill': {
                this.fillBytes(node);
                break;
            }
            case 'setpc': {
                this.setPC(node.pc);
                break;
            }
            case 'binary': {
                this.emitBinary(node);
                break;
            }
            case 'include': {
                this.fileInclude(node);
                break;
            }
            case 'if': {
                const { cond, trueBranch, falseBranch } = node
                const { lit: condVal } = this.evalExpr(node.cond);
                if (isTrueVal(condVal)) {
                    this.assembleStmtList(trueBranch);
                } else {
                    this.assembleStmtList(falseBranch);
                }
                break;
            }
            case 'for': {
                const { index, list, body, loc } = node
                const lst: any = this.evalExpr(list);
                const elts = lst.values
                for (let i = 0; i < elts.length; i++) {
                    this.withScope('__forloop', () => {
                        const value = this.evalExpr(elts[i])
                        const loopVar: Constant = {
                            arg: ast.mkMacroArg(index),
                            value
                        };
                        this.variables.add(index.name, loopVar);
                        return this.assembleStmtList(body);
                    });
                }
                break;
            }
            case 'macro': {
                const { name, args, body } = node;
                // TODO check for duplicate arg names!
                const prevMacro = this.scopes.findMacro(name.name);
                if (prevMacro !== undefined) {
                    // TODO previous declaration from prevMacro
                    this.error(`Macro '${name.name}' already defined`, name.loc);
                }
                this.scopes.addMacro(name.name, node);
                break;
            }
            case 'callmacro': {
                let argValues = [];
                const { name, args } = node;
                const macro = this.scopes.findMacro(name.name);

                if (!macro) {
                    this.error(`Undefined macro '${name.name}'`, name.loc);
                }
                if (macro.args.length !== args.length) {
                    this.error(`Macro '${name.name}' declared with ${macro.args.length} args but called here with ${args.length}`,
                        name.loc);
                }

                for (let argIdx = 0; argIdx < macro.args.length; argIdx++) {
                    const eres = this.evalExpr(args[argIdx]);
                    argValues.push({
                        type: 'value',
                        value: eres
                    });
                }
                this.withScope(name.name, () => {
                    for (let argIdx = 0; argIdx < argValues.length; argIdx++) {
                        const argName = macro.args[argIdx].ident;
                        this.variables.add(argName.name, {
                            arg: { ident: argName },
                            value: argValues[argIdx].value
                        });
                    }
                    this.assembleStmtList(macro.body);
                });
                break;
            }
            case 'let': {
                const name = node.name;
                const prevVariable = this.variables.find(name.name);
                if (prevVariable) {
                    this.error(`Variable '${name.name}' already defined`, node.loc);
                }
                const eres = this.evalExpr(node.value);
                this.variables.add(name.name, {
                    arg: { ident: name },
                    value: eres
                });
                break;
            }
            case 'assign': {
                const name = node.name;
                const prevVariable = this.variables.find(name.name);
                if (!prevVariable) {
                    this.error(`Assignment to undeclared variable '${name.name}'`, node.loc);
                }
                const lit: ast.Expr = this.evalExpr(node.value);
                prevVariable.value = lit;
                break;
            }
            case 'load-plugin': {
                const fname = node.filename;
                const pluginFunc = require(path.resolve(this.makeSourceRelativePath(fname)));
                const funcName = node.funcName.name;
                this.variables.add(funcName, {
                    arg: {
                        ident: node.funcName
                    },
                    value: {
                        type: 'function',
                        func: (args) => {
                            const res = pluginFunc({
                                readFileSync,
                                resolveRelative: fn => this.makeSourceRelativePath(fn)
                            }, ...args);
                            return ast.objectToAst(res, node.loc);
                        }
                    }
                })
                break;
            }
            default:
                throw new Error(`unknown directive ${node.type}`)
        }
    }

    assembleStmtList = (lst) => {
        if (lst === null) {
            return;
        }
        for (let i = 0; i < lst.length; i++) {
            this.assembleLine(lst[i]);
        }
    }

    assembleLine = (line) => {
        // Empty lines are no-ops
        if (line === null) {
            return true;
        }

        if (line.label !== null) {
            let lblSymbol = line.label;
            const seenSymbol = this.scopes.findSeenLabel(lblSymbol.name);
            if (seenSymbol) {
                this.error(`Label '${seenSymbol.name}' already defined`, lblSymbol.loc);
                // this.note
                // on line ${lineNo}`)
            } else {
                const labelChanged = this.scopes.declareLabelSymbol(lblSymbol, this.codePC);
                if (labelChanged) {
                    this.needPass = true;
                }
            }
        }

        if (line.scopedStmts) {
            this.withScope(line.label, () => {
                this.assembleStmtList(line.scopedStmts);
            });
            return;
        }

        if (line.stmt === null) {
            return;
        }

        if (line.stmt.type !== 'insn') {
            this.checkDirectives(line.stmt);
            return;
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
                return;
            }
            if (this.checkImm(insn.imm, op[0])) {
                return;
            }
            if (this.checkAbs(insn.abs, op[1], 8)) {
                return;
            }

            if (this.checkAbs(insn.absx, op[2], 8)) {
                return;
            }
            if (this.checkAbs(insn.absy, op[3], 8)) {
                return;
            }

            if (this.checkAbs(insn.absx, op[5], 16)) {
                return;
            }
            if (this.checkAbs(insn.absy, op[6], 16)) {
                return;
            }
            // Absolute indirect
            if (this.checkAbs(insn.absind, op[7], 16)) {
                return;
            }

            if (this.checkAbs(insn.indx, op[8], 8)) {
                return;
            }
            if (this.checkAbs(insn.indy, op[9], 8)) {
                return;
            }

            if (this.checkAbs(insn.abs, op[4], 16)) {
                return;
            }
            if (this.checkBranch(insn.abs, op[11])) {
                return;
            }
            this.error(`Couldn't encoder instruction '${insn.mnemonic}'`, line.loc);
        } else {
            this.error(`Unknown mnemonic '${insn.mnemonic}'`, line.loc);
        }
    }

    makeSourceRelativePath(filename: string): string {
        const curSource = this.peekSourceStack();
        return path.join(path.dirname(curSource), filename);
    }

    assemble = (source) => {
        try {
            const statements = parser.parse(source, {
                source: this.peekSourceStack()
            });
            this.assembleStmtList(statements);
        } catch(err) {
            if ('name' in err && err.name == 'SyntaxError') {
                this.addError(`Syntax error: ${err.message}`, {
                    ...err.location,
                    source: this.peekSourceStack()
                })
            } else if ('name' in err && err.name == 'semantic') {
                return;
            }
        }
    }

    registerPlugins () {
        const json = {
            type: 'function',
            func: args => {
                const name = args[0].lit;
                const fname = this.makeSourceRelativePath(name)
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
            this.variables.add(name, {
                arg: {
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

    asm.pushVariableScope();
    asm.registerPlugins();

    let pass = 0;
    do {
        asm.pushVariableScope();
        asm.startPass(pass);

        asm.assemble(src);
        if (asm.anyErrors()) {
            return {
                errors: asm.errors()
            }
        }

        asm.popVariableScope();
        const maxPass = 10;
        if (pass > maxPass) {
            console.error(`Exceeded max pass limit ${maxPass}`);
            return;
        }
        pass += 1;
    } while(asm.needPass && !asm.anyErrors());

    asm.popVariableScope();
    asm.popSource();

    return {
        prg: asm.prg(),
        errors: asm.errors()
    }
}
