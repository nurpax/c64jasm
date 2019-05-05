
import opcodes from './opcodes'
import * as path from 'path'
const importFresh = require('import-fresh');

import { readFileSync } from 'fs'
import { toHex16 } from './util'
import * as ast from './ast'
import { SourceLoc } from './ast'
import ParseCache from './parseCache'
import { DebugInfoTracker } from './debugInfo';

interface Error {
    loc: SourceLoc,
    msg: string
}

interface LabelAddr {
    addr: number,
    loc: SourceLoc
}

class NamedScope<T> {
    syms: Map<string, {val: T, seen: number}> = new Map();
    readonly parent: NamedScope<T> | null = null;
    readonly name: string;
    children: Map<string, NamedScope<T>> = new Map();

    constructor (parent: NamedScope<T> | null, name: string) {
        this.parent = parent;
        this.name = name;
    }

    enter(name: string): NamedScope<T> {
        const s = this.children.get(name);
        if (s !== undefined) {
            return s;
        }
        const newScope = new NamedScope<T>(this, name);
        this.children.set(name, newScope);
        return newScope;
    }

    leave(): NamedScope<T> {
        return this.parent!;
    }

    // Find symbol from current and all parent scopes
    findSymbol(name: string): {val: T, seen: number} | undefined {
        for (let cur: NamedScope<T>|null = this; cur !== null; cur = cur.parent) {
            const n = cur.syms.get(name);
            if (n !== undefined) {
                return n;
            }
        }
        return undefined;
    }

    // Find relative label::path::sym style references from the symbol table
    findSymbolPath(path: string[]): {val: T, seen: number} | undefined {
        if (path.length == 1) {
            return this.findSymbol(path[0]);
        }

        // Go up the scope tree until we find the start of
        // the relative path.
        let tab: NamedScope<T> | null | undefined = this;
        while (tab.children.get(path[0]) == undefined) {
            tab = tab.parent;
            if (tab == null) {
                return undefined;
            }
        }

        // Go down the tree to match the path to a symbol
        for (let i = 0; i < path.length-1; i++) {
            tab = tab.children.get(path[i]);
            if (tab == undefined) {
                return undefined;
            }
        }
        return tab.syms.get(path[path.length-1]);
    }

    addSymbol(name: string, val: T, pass: number): void {
        this.syms.set(name, { val, seen: pass });
    }

    updateSymbol(name: string, val: T, pass: number) {
        for (let cur: NamedScope<T>|null = this; cur !== null; cur = cur.parent) {
            const v = cur.syms.get(name);
            if (v !== undefined) {
                cur.syms.set(name, { val, seen: pass });
                return;
            }
        }
    }

}

type SymEntry  = SymLabel | SymVar | SymMacro;

interface SymLabel {
    type: 'label';
    data: LabelAddr;
}

interface SymVar {
    type: 'var';
    data: any;
}

interface SymMacro {
    type: 'macro';
    data: ast.StmtMacro;
}

class Scopes {
    passCount: number = 0;
    root: NamedScope<SymEntry> = new NamedScope<SymEntry>(null, '');
    curSymtab = this.root;
    private anonScopeCount = 0;

    startPass(pass: number): void {
        this.curSymtab = this.root;
        this.anonScopeCount = 0;
        this.passCount = pass;
    }

    pushAnonScope(): void {
        this.pushLabelScope(`__anon_scope_${this.anonScopeCount}`);
        this.anonScopeCount++;
    }
    popAnonScope(): void {
        this.popLabelScope();
    }

    pushLabelScope(name: string): void {
        this.curSymtab = this.curSymtab.enter(name);
    }

    popLabelScope(): void {
        this.curSymtab = this.curSymtab.leave();
    }

    findPath(path: string[], absolute: boolean): { sym: SymEntry, seen: number } | undefined {
        if (absolute) {
            const n = this.root.findSymbolPath(path);
            if (n !== undefined) {
                return {
                    sym: n.val,
                    seen: n.seen
                }
            }
            return undefined;
        }
        const n = this.curSymtab.findSymbolPath(path);
        if (n !== undefined) {
            return {
                sym: n.val,
                seen: n.seen
            }
    }
        return undefined;
    }

    findQualifiedSym(path: string[], absolute: boolean): { sym: SymEntry, seen: number } | undefined {
        return this.findPath(path, absolute);
    }

    findQualifiedVar(path: string[], absolute: boolean): any | undefined {
        const se = this.findPath(path, absolute);
        if (se !== undefined && se.sym.type == 'var') {
            return se.sym.data;
        }
        return undefined;
    }


    symbolSeen(name: string): boolean {
        const n = this.curSymtab.syms.get(name);
        if (n !== undefined) {
            return n.seen == this.passCount;
        }
        return false;
    }

    declareLabelSymbol(symbol: ast.Label, codePC: number): boolean {
        const { name, loc } = symbol;

        // As we allow name shadowing, we must look up the name
        // only from the current scope.  If we lookup parent
        // scopes for label declarations, we end up
        // mutating some unrelated, but same-named label names.
        const prevLabel = this.curSymtab.syms.get(name);
        const lblsym: SymLabel = {
            type: 'label',
            data: { addr: codePC, loc }
        };
        if (prevLabel == undefined) {
            this.curSymtab.addSymbol(name, lblsym, this.passCount);
            return false;
        }
        if (prevLabel.val.type !== 'label') {
            throw new Error('ICE: declareLabelSymbol should be called only on labels');
        }
        const lbl = prevLabel.val;
        // If label address has changed change, need one more pass
        if (lbl.data.addr !== codePC) {
            this.curSymtab.updateSymbol(name, lblsym, this.passCount);
            return true;
        }
        return false;
    }

    declareVar(name: string, value: any): void {
        this.curSymtab.addSymbol(name, {
            type: 'var',
            data: value
        }, this.passCount)
    }

    updateVar(path: string[], absolute: boolean, val:any) {
        if (path.length !== 1 || absolute) {
            throw new Error('should not happen TBD');
        }
        const prevVar = this.curSymtab.findSymbol(path[0]);
        if (prevVar == undefined || prevVar.val.type !== 'var') {
            throw new Error('should not happen');
        }
        const newVar: SymVar = {
            type: 'var',
            data: val
        };
        this.curSymtab.updateSymbol(path[0], newVar, this.passCount);
    }

    findMacro(path: string[], absolute: boolean): ast.StmtMacro | undefined {
        const sym = this.findPath(path, absolute);
        if (sym !== undefined && sym.sym.type == 'macro') {
            return sym.sym.data;
        }
        return undefined;
    }

    declareMacro(name: string, value: ast.StmtMacro): void {
        this.curSymtab.addSymbol(name, {
            type: 'macro',
            data: value
        }, this.passCount)
    }

    dumpLabels(codePC: number) {
        type StackEntry = {prefix: string, sym: NamedScope<SymEntry>};
        const stack: StackEntry[] = [];
        const pushScope = (prefix: string, sym: NamedScope<SymEntry>) => {
            stack.push({ prefix: `${prefix}/${sym.name}`, sym });
        }
        pushScope('', this.root);

        const labels = [];
        while (stack.length > 0) {
            const s = stack.pop()!;
            for (let [k,lbl] of s.sym.syms) {
                if (lbl.val.type == 'label') {
                    labels.push({ name: `${s.prefix}/${k}`, addr: lbl.val.data.addr, size: 0 });
                }
            }
            for (let [k, sym] of s.sym.children) {
                pushScope(s.prefix, sym);
            }
        }

        const sortedLabels = labels.sort((a, b) => {
            return a.addr - b.addr;
        })

        const numLabels = sortedLabels.length;
        if (numLabels > 0) {
            for (let i = 1; i < numLabels; i++) {
                sortedLabels[i-1].size = sortedLabels[i].addr - sortedLabels[i-1].addr;
            }
            const last = sortedLabels[numLabels-1];
            last.size = codePC - last.addr;
        }
        return sortedLabels;
    }
}

function isTrueVal(cond: number | boolean): boolean {
    return (cond === true || cond != 0);
}

function makeCompileLoc(filename: string) {
    // SourceLoc can be undefined here if parse is executed out of AST
    // (e.g., source file coming from CLI), so make up an error loc for it.
    return {
        source: filename,
        start: { offset: 0, line: 0, column: 0 },
        end: { offset: 0, line: 0, column: 0 }
    };
}

function formatSymbolPath(p: ast.ScopeQualifiedIdent): string {
    return `${p.absolute ? '::' : ''}${p.path.join('::')}`;
}

interface BranchOffset {
    offset: number;
    loc: SourceLoc;
}

const runBinopNum = (a: any, b: any, f: (a: number, b: number) => number | boolean) => {
    // TODO a.type, b.type must be literal
    const res = f(a as number, b as number);
    if (typeof res == 'boolean') {
        return res ? 1 : 0;
    }
    return res;
}

class Assembler {
    // TODO this should be a resizable array instead
    binary: number[] = [];

    parseCache = new ParseCache();
    pluginCache = new Map();

    includeStack: string[] = [];
    codePC = 0;
    pass = 0;
    needPass = false;
    scopes = new Scopes();
    errorList: Error[] = [];
    outOfRangeBranches: BranchOffset[] = [];

    // PC<->source location tracking for debugging support.  Reset on each pass
    debugInfo = new DebugInfoTracker();

    prg (): Buffer {
      // 1,8 is for encoding the $0801 starting address in the .prg file
      return Buffer.from([1, 8].concat(this.binary))
    }

    parse (filename: string, loc: SourceLoc | undefined) {
        const l = loc == undefined ? makeCompileLoc(filename) : loc;
        return this.parseCache.parse(filename, loc, ((fname, _loc) => this.guardedReadFileSync(fname, l)));
    }

    // Cache plugin require's so that we fresh require() them only in the first pass.
    // importFresh is somewhat slow because it blows through Node's cache
    // intentionally.  We don't want it completely cached because changes to plugin
    // code must trigger a recompile and in that case we want the plugins really
    // reloaded too.
    requirePlugin(fname: string): any {
        const p = this.pluginCache.get(fname);
        if (p !== undefined) {
            return p;
        }
        const newPlugin = importFresh(path.resolve(this.makeSourceRelativePath(fname)));
        this.pluginCache.set(fname, newPlugin);
        return newPlugin;
    }

    peekSourceStack (): string {
        const len = this.includeStack.length;
        return this.includeStack[len-1];
    }

    pushSource (fname: string): void {
        this.includeStack.push(fname);
    }

    popSource (): void {
        this.includeStack.pop();
    }

    anyErrors (): boolean {
        return this.errorList.length !== 0;
    }

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

    startPass (pass: number): void {
      this.codePC = 0x801;
      this.pass = pass;
      this.needPass = false;
      this.binary = [];
      this.scopes.startPass(pass);
      this.outOfRangeBranches = [];
      this.debugInfo = new DebugInfoTracker();
    }

    emitBasicHeader () {
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

    emitBinary (ast: ast.StmtBinary): void {
        const { filename } = ast
        const fname = this.makeSourceRelativePath(this.evalExpr(filename));
        const buf: Buffer = this.guardedReadFileSync(fname, ast.loc);

        let offset = 0
        let size = buf.byteLength
        if (ast.size !== null) {
            if (ast.offset !== null) {
                offset = this.evalExpr(ast.offset);
            }
            if (ast.size !== null) {
                const sizeExprVal = this.evalExpr(ast.size);
                size = sizeExprVal;
            }
        }
        // TODO buffer overflow
        for (let i = 0; i < size; i++) {
            this.emit(buf.readUInt8(i + offset));
        }
    }

    evalExpr(node: ast.Expr): any {
        switch (node.type) {
            case 'binary': {
                const left = this.evalExpr(node.left);
                const right = this.evalExpr(node.right);
                switch (node.op) {
                    case '+': return  runBinopNum(left, right, (a,b) => a + b)
                    case '-': return  runBinopNum(left, right, (a,b) => a - b)
                    case '*': return  runBinopNum(left, right, (a,b) => a * b)
                    case '/': return  runBinopNum(left, right, (a,b) => a / b)
                    case '%': return  runBinopNum(left, right, (a,b) => a % b)
                    case '&': return  runBinopNum(left, right, (a,b) => a & b)
                    case '|': return  runBinopNum(left, right, (a,b) => a | b)
                    case '^': return  runBinopNum(left, right, (a,b) => a ^ b)
                    case '<<': return runBinopNum(left, right, (a,b) => a << b)
                    case '>>': return runBinopNum(left, right, (a,b) => a >> b)
                    case '==': return runBinopNum(left, right, (a,b) => a == b)
                    case '!=': return runBinopNum(left, right, (a,b) => a != b)
                    case '<':  return runBinopNum(left, right, (a,b) => a <  b)
                    case '<=': return runBinopNum(left, right, (a,b) => a <= b)
                    case '>':  return runBinopNum(left, right, (a,b) => a >  b)
                    case '>=': return runBinopNum(left, right, (a,b) => a >= b)
                    case '&&': return runBinopNum(left, right, (a,b) => a && b)
                    case '||': return runBinopNum(left, right, (a,b) => a || b)
                    default:
                        throw new Error(`Unhandled binary operator ${node.op}`);
                }
            }
            case 'unary': {
                const v = this.evalExpr(node.expr);
                switch (node.op) {
                    case '+': return +v;
                    case '-': return -v;
                    case '~': return ~v;
                    default:
                        throw new Error(`Unhandled unary operator ${node.op}`);
                }
            }
            case 'literal': {
                return node.lit;
            }
            case 'array': {
                return node.list.map(v => this.evalExpr(v));
            }
            case 'ident': {
                throw new Error('should not see an ident here -- if you do, it is probably a wrong type node in parser')
            }
            case 'qualified-ident': {
                // Namespace qualified ident, like foo::bar::baz
                const sym = this.scopes.findQualifiedSym(node.path, node.absolute);
                if (sym == undefined) {
                    if (this.pass === 1) {
                        this.error(`Undefined symbol '${formatSymbolPath(node)}'`, node.loc)
                    }
                    // Return a placeholder that should be resolved in the next pass
                    this.needPass = true;
                    return 0;
                }

                switch (sym.sym.type) {
                    case 'label':
                        return sym.sym.data.addr;
                    case 'var':
                        if (sym.seen < this.pass) {
                            return this.error(`Undeclared variable '${formatSymbolPath(node)}`, node.loc);
                        }
                        return sym.sym.data;
                    case 'macro':
                        return this.error(`Must have a label or a variable identifier here, got macro name`, node.loc);
                }
                break;
            }
            case 'member': {
                const object = this.evalExpr(node.object);

                if (object == undefined) {
                    return this.error(`Cannot access properties of an unresolved symbol'`, node.loc);
                }

                if (object instanceof Array) {
                    if (!node.computed) {
                        return this.error(`Cannot use the dot-operator on array values`, node.loc)
                    }
                    const idx = this.evalExpr(node.property);
                    if (typeof idx !== 'number') {
                        return this.error(`Array index must be an integer, got ${typeof idx}`, node.loc);
                    }
                    if (!(idx in object)) {
                        return this.error(`Out of bounds array index ${idx}`, node.property.loc)
                    }
                    return object[idx];
                }  else if (typeof object == 'object') {
                    const checkProp = (obj: any, prop: string|number, loc: SourceLoc) => {
                        if (!(prop in object)) {
                            this.error(`Property '${prop}' does not exist in object`, loc);
                        }
                    }
                    if (!node.computed) {
                        if (node.property.type !== 'ident') {
                            return this.error(`Object property must be a string, got ${typeof node.property.type}`, node.loc);
                        }
                        checkProp(object, node.property.name, node.property.loc);
                        return object[node.property.name];
                    } else {
                        let prop = this.evalExpr(node.property);
                        if (typeof prop !== 'string' && typeof prop !== 'number') {
                            return this.error(`Object property must be a string or an integer, got ${typeof prop}`, node.loc);
                        }
                        checkProp(object, prop, node.property.loc);
                        return object[prop];
                    }
                }

                // Don't report in first compiler pass because an identifier may
                // still have been unresolved.  These cases should be reported by
                // name resolution in pass 1.
                if (this.pass !== 0) {
                    if (node.computed) {
                        return this.error(`Cannot use []-operator on non-array/object values`, node.loc)
                    } else {
                        return this.error(`Cannot use the dot-operator on non-object values`, node.loc)
                    }
                    return 0;
                }
                break;
            }
            case 'callfunc': {
                const callee = this.evalExpr(node.name);
                if (typeof callee !== 'function') {
                    this.error(`Callee must be a function type.  Got '${typeof callee}'`, node.loc);
                }
                const argValues = [];
                for (let argIdx = 0; argIdx < node.args.length; argIdx++) {
                    const e = this.evalExpr(node.args[argIdx]);
                    argValues.push(e);
                }
                try {
                    return callee(argValues);
                } catch(err) {
                    // TODO we lose the name for computed function names, like
                    // !use 'foo' as x
                    // x[3]()
                    // This is not really supported now though.

                    // TODO callee is in fact an expression so we don't
                    // have a name for it here.  But it's mostly an identifier
                    // so show that just to pass tests for now.
                    const nn = ((node.name) as unknown) as ast.ScopeQualifiedIdent;
                    this.error(`Call to '${formatSymbolPath(nn)}' failed with an error: ${err.message}`, node.loc);
                }
            }
            default:
                throw new Error('unhandled type ' + node.type);
                break;
        }
    }

    emit (byte: number): void {
        this.binary.push(byte);
        this.codePC += 1
    }

    emit16 (word: number): void {
        this.emit(word & 0xff);
        this.emit((word>>8) & 0xff);
    }

    // TODO shouldn't have any for opcode
    checkSingle (opcode: number | null): boolean {
        if (opcode === null) {
            return false;
        }
        this.emit(opcode)
        return true;
    }

    checkImm (param: any, opcode: number | null): boolean {
        if (opcode === null || param === null) {
            return false;
        }
        const eres = this.evalExpr(param);
        this.emit(opcode);
        this.emit(eres);
        return true;
    }

    checkAbs (param: any, opcode: number | null, bits: number): boolean {
        if (opcode === null || param === null) {
            return false;
        }
        const v = this.evalExpr(param);
        if (bits === 8) {
            if (v < 0 || v >= (1<<bits)) {
                return false;
            }
            this.emit(opcode);
            this.emit(v);
        } else {
            this.emit(opcode);
            this.emit16(v);
        }
        return true
    }

    checkBranch (param: any, opcode: number | null): boolean {
        if (opcode === null || param === null) {
            return false;
        }
        const addr = this.evalExpr(param);
        const addrDelta = addr - this.codePC - 2;
        this.emit(opcode);
        if (addrDelta > 0x7f || addrDelta < -128) {
            // Defer reporting out of 8-bit range branch targets to the end of the
            // current pass (or report nothing if we need another pass.)
            this.outOfRangeBranches.push({ loc: param.loc, offset: addrDelta });
        }
        this.emit(addrDelta & 0xff);
        return true;
      }

    setPC (valueExpr: ast.Expr): void {
        const v = this.evalExpr(valueExpr);
        if (this.codePC > v) {
            // TODO this is not great.  Actually need to track which ranges of memory have something in them.
            this.error(`Cannot set program counter to a smaller value than current (current: $${toHex16(this.codePC)}, trying to set $${toHex16(v)})`, valueExpr.loc)
        }
        while (this.codePC < v) {
            this.emit(0);
        }
    }

    guardedReadFileSync(fname: string, loc: SourceLoc): Buffer {
        try {
            return readFileSync(fname);
        } catch (err) {
            return this.error(`Couldn't open file '${fname}'`, loc);
        }
    }

    fileInclude (inclStmt: ast.StmtInclude): void {
        const fname = this.makeSourceRelativePath(this.evalExpr(inclStmt.filename));
        this.pushSource(fname);
        this.assemble(fname, inclStmt.loc);
        this.popSource();
    }

    fillBytes (n: ast.StmtFill): void {
        const numVals = this.evalExpr(n.numBytes);
        const fillValue = this.evalExpr(n.fillValue);
        const fv = fillValue;
        if (fv < 0 || fv >= 256) {
            this.error(`!fill value to repeat must be in 8-bit range, '${fv}' given`, fillValue.loc);
        }
        for (let i = 0; i < numVals; i++) {
            this.emit(fv);
        }
    }

    alignBytes (n: ast.StmtAlign): void {
        const nb = this.evalExpr(n.alignBytes);
        if (typeof nb !== 'number') {
            this.error(`Alignment must be a number, ${typeof nb} given`, n.alignBytes.loc);
        }
        if (nb < 1) {
            this.error(`Alignment must be a positive integer, ${nb} given`, n.alignBytes.loc);
        }
        if ((nb & (nb-1)) != 0) {
            this.error(`Alignment must be a power of two, ${nb} given`, n.loc);
        }
        while ((this.codePC & (nb-1)) != 0) {
            this.emit(0);
        }
    }

    // Enter anonymous block scope
    withAnonScope(compileScope: () => void): void {
        this.scopes.pushAnonScope();
        compileScope();
        this.scopes.popAnonScope();
    }

    // Enter named scope
    withLabelScope (name: string, compileScope: () => void): void {
        this.scopes.pushLabelScope(name);
        compileScope();
        this.scopes.popLabelScope();
    }

    emit8or16(v: number, bits: number) {
        if (bits == 8) {
            this.emit(v);
            return;
        }
        this.emit16(v);
    }

    emitData (exprList: ast.Expr[], bits: number) {
        for (let i = 0; i < exprList.length; i++) {
            const e = this.evalExpr(exprList[i]);
            if (typeof e == 'number') {
                this.emit8or16(e, bits);
            } else if (e instanceof Array) {
                // TODO function 'assertType' that returns the value and errors otherwise
                for (let bi in e) {
                    this.emit8or16(e[bi], bits);
                }
            } else {
                this.error(`Only literal (int constants) or array types can be emitted.  Got ${typeof e}`, exprList[i].loc);
            }
        }
    }

    makeFunction (pluginFunc: Function, loc: SourceLoc) {
        return (args: any[]) => {
            const res = pluginFunc({
                readFileSync,
                resolveRelative: (fn: string) => this.makeSourceRelativePath(fn)
            }, ...args);
            return res;
        }
    }

    bindFunction (name: ast.Ident, pluginModule: any, loc: SourceLoc) {
        this.scopes.declareVar(name.name, this.makeFunction(pluginModule, loc));
    }

    bindPlugin (node: ast.StmtLoadPlugin, pluginModule: any) {
        const moduleName = node.moduleName;
        // Bind default export as function
        if (typeof pluginModule == 'function') {
            this.bindFunction(moduleName, pluginModule, node.loc);
        }
        if (typeof pluginModule == 'object') {
            const moduleObj: any = {};
            const keys = Object.keys(pluginModule);
            for (let ki in keys) {
                const key = keys[ki];
                const func = pluginModule[key];
                moduleObj[key] = this.makeFunction(func, node.loc);
            }
            this.scopes.declareVar(moduleName.name, moduleObj);
        }
    }

    checkDirectives (node: ast.Stmt): void {
        switch (node.type) {
            case 'data': {
                this.emitData(node.values, node.dataSize === ast.DataSize.Byte ? 8 : 16);
                break;
            }
            case 'fill': {
                this.fillBytes(node);
                break;
            }
            case 'align': {
                this.alignBytes(node);
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
            case 'error': {
                this.error(this.evalExpr(node.error), node.loc);
                break;
            }
            case 'if': {
                const { cases, elseBranch } = node
                for (let ci in cases) {
                    const [condExpr, body] = cases[ci];
                    const condition = this.evalExpr(condExpr);
                    if (isTrueVal(condition)) {
                        return this.withAnonScope(() => {
                            this.assembleLines(body);
                        });
                    }
                }
                return this.withAnonScope(() => {
                    this.assembleLines(elseBranch);
                })
                break;
            }
            case 'for': {
                const { index, list, body, loc } = node
                const lst = this.evalExpr(list);
                if (!(lst instanceof Array)) {
                    this.error(`for-loop range must be an array expression (e.g., a range() or an array)`, list.loc);
                }
                for (let i = 0; i < lst.length; i++) {
                    this.withAnonScope(() => {
                        const value = lst[i];
                        this.scopes.declareVar(index.name, value);
                        return this.assembleLines(body);
                    });
                }
                break;
            }
            case 'macro': {
                const { name, args, body } = node;
                // TODO check for duplicate arg names!
                const prevMacro = this.scopes.findMacro([name.name], false);
                if (prevMacro !== undefined && this.scopes.symbolSeen(name.name)) {
                    // TODO previous declaration from prevMacro
                    return this.error(`Macro '${name.name}' already defined`, name.loc);
                }
                this.scopes.declareMacro(name.name, node);
                break;
            }
            case 'callmacro': {
                let argValues: any[] = [];
                const { name, args } = node;
                const macro = this.scopes.findMacro(name.path, name.absolute);

                if (macro == undefined) {
                    return this.error(`Undefined macro '${formatSymbolPath(name)}'`, name.loc);
                }

                if (macro.args.length !== args.length) {
                    this.error(`Macro '${formatSymbolPath(name)}' declared with ${macro.args.length} args but called here with ${args.length}`,
                        name.loc);
                }

                for (let i = 0; i < macro.args.length; i++) {
                    const eres = this.evalExpr(args[i]);
                    argValues.push(eres);
                }

                this.withAnonScope(() => {
                    for (let i = 0; i < argValues.length; i++) {
                        const argName = macro.args[i].ident.name;
                        this.scopes.declareVar(argName, argValues[i]);
                    }
                    this.assembleLines(macro.body);
                });
                break;
            }
            case 'let': {
                const name = node.name;
                const sym = this.scopes.findQualifiedSym([name.name], false);
                const eres = this.evalExpr(node.value);

                if (sym !== undefined && this.scopes.symbolSeen(name.name)) {
                    return this.error(`Variable '${name.name}' already defined`, node.loc);
                }
                this.scopes.declareVar(name.name, eres);
                break;
            }
            case 'assign': {
                const name = node.name;
                const prevValue = this.scopes.findQualifiedVar(node.name.path, node.name.absolute);
                if (prevValue == undefined) {
                    return this.error(`Assignment to undeclared variable '${formatSymbolPath(name)}'`, node.loc);
                }
                const evalValue = this.evalExpr(node.value);
                this.scopes.updateVar(name.path, name.absolute, evalValue);
                break;
            }
            case 'load-plugin': {
                const fname = node.filename;
                const pluginModule = this.requirePlugin(this.evalExpr(fname));
                this.bindPlugin(node, pluginModule);
                break;
            }
            default:
                this.error(`unknown directive ${node.type}`, node.loc);
        }
    }

    assembleLines (lst: ast.AsmLine[]): void {
        if (lst === null) {
            return;
        }
        for (let i = 0; i < lst.length; i++) {
            this.debugInfo.startLine(lst[i].loc, this.codePC);
            this.assembleLine(lst[i]);
            this.debugInfo.endLine(this.codePC);
        }
    }

    assembleLine (line: ast.AsmLine): void {
        // Empty lines are no-ops
        if (line.label == null && line.stmt == null && line.scopedStmts == null) {
            return;
        }

        if (line.label !== null) {
            let lblSymbol = line.label;
            if (this.scopes.symbolSeen(lblSymbol.name)) {
                this.error(`Label '${lblSymbol.name}' already defined`, lblSymbol.loc);
            } else {
                const labelChanged = this.scopes.declareLabelSymbol(lblSymbol, this.codePC);
                if (labelChanged) {
                    this.needPass = true;
                }
            }
        }

        const scopedStmts = line.scopedStmts;
        if (scopedStmts != null) {
            if (!line.label) {
                throw new Error('ICE: line.label cannot be undefined');
            }
            this.withLabelScope(line.label.name, () => {
                this.assembleLines(scopedStmts);
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
            this.error(`Couldn't encode instruction '${insn.mnemonic}'`, line.loc);
        } else {
            this.error(`Unknown mnemonic '${insn.mnemonic}'`, line.loc);
        }
    }

    makeSourceRelativePath(filename: string): string {
        const curSource = this.peekSourceStack();
        return path.join(path.dirname(curSource), filename);
    }

    assemble (filename: string, loc: SourceLoc | undefined): void {
        try {
            const astLines = this.parse(filename, loc);
            this.assembleLines(astLines);
        } catch(err) {
            if ('name' in err && err.name == 'SyntaxError') {
                this.addError(`Syntax error: ${err.message}`, {
                    ...err.location,
                    source: this.peekSourceStack()
                })
            } else if ('name' in err && err.name == 'semantic') {
                return;
            } else {
                throw err;
            }
        }
    }

    _requireType(e: any, type: string): (any | never) {
        if (typeof e == type) {
            return e;
        }
        return this.error(`Expecting a ${type} value, got ${typeof e}`, e.loc);
    }

    requireString(e: any): (string | never) { return this._requireType(e, 'string') as string; }
    requireNumber(e: ast.Literal): (number | never) { return this._requireType(e, 'number') as number; }

    registerPlugins () {
        const json = (args: any[]) => {
            const name = this.requireString(args[0]);
            const fname = this.makeSourceRelativePath(name);
            return JSON.parse(readFileSync(fname, 'utf-8'));
        }
        const range = (args: any[]) => {
            let start = 0;
            let end = undefined;
            if (args.length == 1) {
                end = this.requireNumber(args[0]);
            } else if (args.length == 2) {
                start = this.requireNumber(args[0]);
                end = this.requireNumber(args[1]);
            } else {
                throw new Error(`Invalid number of args to 'range'.  Expecting 1 or 2 arguments.`)
            }
            if (end == start) {
                return [];
            }
            if (end < start) {
                throw new Error(`range 'end' must be larger or equal to 'start'`)
            }
            return Array(end-start).fill(null).map((_,idx) => idx + start);
        };
        const addPlugin = (name: string, handler: any) => {
            this.scopes.declareVar(name, handler);
        }
        addPlugin('loadJson', json);
        addPlugin('range', range);
    }

    dumpLabels () {
        return this.scopes.dumpLabels(this.codePC);
    }
}

export function assemble(filename: string) {
    const asm = new Assembler();
    asm.pushSource(filename);

    let pass = 0;
    do {
        asm.startPass(pass);
        asm.registerPlugins();
        asm.assemble(filename, makeCompileLoc(filename));

        if (asm.anyErrors()) {
            return {
                prg: Buffer.from([]),
                labels: [],
                debugInfo: undefined,
                errors: asm.errors()
            }
        }

        const maxPass = 10;
        if (pass > maxPass) {
            console.error(`Exceeded max pass limit ${maxPass}`);
            return;
        }
        pass += 1;

        if (!asm.needPass && asm.outOfRangeBranches.length != 0) {
            for (let bidx in asm.outOfRangeBranches) {
                const b = asm.outOfRangeBranches[bidx];
                asm.addError(`Branch target too far (must fit in signed 8-bit range, got ${b.offset})`, b.loc);
            }
            break;
        }
    } while(asm.needPass && !asm.anyErrors());

    asm.popSource();

    return {
        prg: asm.prg(),
        errors: asm.errors(),
        labels: asm.dumpLabels(),
        debugInfo: asm.debugInfo
    }
}
