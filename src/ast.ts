
export interface Loc {
  offset: number,
  line: number,
  column: number
}

export interface SourceLoc {
  start: Loc,
  end: Loc,
  source: string
}

export interface Node {
  loc: SourceLoc;
}

export interface Label extends Node {
  name: string;
}

export interface Literal extends Node {
  type: 'literal',
  lit: number | string
}

export interface Ident extends Node {
  type: 'ident';
  name: string;
}

export interface ScopeQualifiedIdent extends Node {
  type: 'qualified-ident';
  path: string[];
  absolute: boolean;
}

export interface Kwarg extends Node {
  type: 'kwarg';
  name: Ident;
  value: Expr;
}

export interface Unary extends Node {
  type: 'unary';
  op: string;
  expr: Expr;
}

export interface BinaryOp extends Node {
  type: 'binary';
  op: string;
  left: Expr;
  right: Expr;
}

export interface ExprArray extends Node {
  type: 'array';
  list: Expr[];
}

export interface ExprObject extends Node {
    type: 'object';
    props: { key: Ident | Literal, val: Expr }[];
};

export interface CallFunc extends Node {
  type: 'callfunc';
  callee: Expr;
  args: Expr[];
}

export interface Member extends Node {
  type: 'member';
  object: Expr;
  property: Expr;
  computed: boolean;
}

export interface GetCurPC extends Node {
  type: 'getcurpc';
}

export function mkLiteral(lit: number | string, loc: SourceLoc): Literal {
  return { type: 'literal', lit, loc };
}

export function mkScopeQualifiedIdent(path: string[], absolute: boolean, loc: SourceLoc): ScopeQualifiedIdent {
  return { type: 'qualified-ident', path, absolute, loc };
}

export function mkIdent(name: string, loc: SourceLoc): Ident {
  return { type: 'ident', name, loc };
}

export function mkKwarg(name: Ident, value: Expr, loc: SourceLoc): Kwarg {
  return { type: 'kwarg', name, value, loc };
}

export function mkUnary(op: string, expr: Expr, loc: SourceLoc): Unary {
  return { type: 'unary', op, expr, loc };
}

export function mkBinaryOp(op: string, left: Expr, right: Expr, loc: SourceLoc): BinaryOp {
  return { type: 'binary', op, left, right, loc };
}

export function mkExprArray(list: Expr[], loc: SourceLoc): ExprArray {
  return { type: 'array', list, loc };
}

export function mkExprObject(props: { key: Ident, val: Expr }[], loc: SourceLoc): ExprObject {
  return { type: 'object', props, loc };
}

export function mkCallFunc(callee: Expr, args: Expr[], loc: SourceLoc): CallFunc {
  return {
    type: 'callfunc',
    callee,
    args: args == null ? [] : args,
    loc
  }
}

export function mkGetCurPC(loc: SourceLoc): GetCurPC {
  return {
    type: 'getcurpc',
    loc
  }
}

export function mkMember(object: Expr, property: Ident, computed: boolean, loc: SourceLoc): Member {
  return { type: 'member', object, property, computed, loc };
}

export enum DataSize { Byte, Word };

export type Expr =
    Ident
  | ScopeQualifiedIdent
  | Literal
  | Unary
  | BinaryOp
  | ExprArray
  | ExprObject
  | CallFunc
  | Member
  | GetCurPC

export type Stmt =
    StmtInsn
  | StmtSetPC
  | StmtAlign
  | StmtData
  | StmtFill
  | StmtInclude
  | StmtBinary
  | StmtIfElse
  | StmtError
  | StmtFor
  | StmtMacro
  | StmtCallMacro
  | StmtLet
  | StmtAssign
  | StmtExpr
  | StmtLoadPlugin
  | StmtFilescope
  | StmtDeclareSegment
  | StmtUseSegment

export type Insn = any

export interface StmtInsn extends Node {
  type: 'insn';
  insn: Insn;
}

export interface StmtSetPC extends Node {
  type: 'setpc';
  pc: Expr;
}

export interface StmtData extends Node {
  type: 'data';
  dataSize: DataSize;
  values: Expr[];
}

export interface StmtFill extends Node {
  type: 'fill';
  numBytes: Expr;
  fillValue: Expr;
}

export interface StmtAlign extends Node {
  type: 'align';
  alignBytes: Expr;
}

export interface StmtInclude extends Node {
  type: 'include';
  filename: Expr;
}

export interface StmtBinary extends Node {
  type: 'binary';
  kwargs: Kwarg[];
}

export interface StmtIfElse extends Node {
  type: 'if';
  cases: [Expr, AsmLine[]][];
  elseBranch: AsmLine[];
}

export interface StmtError extends Node {
  type: 'error';
  error: Literal;
}

export interface StmtFor extends Node {
  type: 'for',
  index: Ident;
  list: Expr;
  body: AsmLine[];
}

export interface MacroArg {
  ident: Ident;
}

export interface StmtMacro extends Node {
  type: 'macro',
  name: Ident;
  args: MacroArg[];
  body: AsmLine[];
}

export interface StmtCallMacro extends Node {
  type: 'callmacro',
  name: ScopeQualifiedIdent;
  args: Expr[];
}

export interface StmtLet extends Node {
  type: 'let',
  name: Ident;
  value: Expr;
}

export interface StmtAssign extends Node {
  type: 'assign',
  name: ScopeQualifiedIdent;
  value: Expr;
}

// Run an expression for its side-effects, discard value
export interface StmtExpr extends Node {
  type: 'statement-expr',
  expr: Expr;
}

export interface StmtLoadPlugin extends Node {
  type: 'load-plugin',
  filename: Literal;
  moduleName: Ident;
}

export interface StmtFilescope extends Node {
  type: 'filescope',
  name: Ident;
}

export interface StmtDeclareSegment extends Node {
    type: 'declare-segment',
    name: Ident;
    kwargs: Kwarg[];
}

export interface StmtUseSegment extends Node {
    type: 'use-segment',
    name: ScopeQualifiedIdent;
}

export interface AsmLine extends Node {
  label: Label | null;
  stmt: Stmt | null;
  scopedStmts: AsmLine[] | null;
}

export function mkLabel(name: string, loc: SourceLoc): Label {
  return { name, loc };
}

export function mkInsn(insn: Insn, loc: SourceLoc): StmtInsn {
  return {
    type: 'insn',
    insn,
    loc
  }
}

export function mkSetPC(pc: Expr, loc: SourceLoc): StmtSetPC {
  return {
    type: 'setpc',
    pc,
    loc
  }
}

export function mkData(dataSize: DataSize, values: Expr[], loc: SourceLoc): StmtData {
  return {
    type: 'data',
    values,
    dataSize,
    loc
  }
}

export function mkFill(numBytes: Expr, fillValue: Expr, loc: SourceLoc): StmtFill {
  return { type: 'fill', numBytes, fillValue, loc }
}

export function mkAlign(alignBytes: Expr, loc: SourceLoc): StmtAlign {
  return { type: 'align', alignBytes, loc }
}

export function mkInclude(filename: Expr, loc: SourceLoc): StmtInclude {
  return {
    type: 'include',
    filename,
    loc
  }
}

export function mkError(error: Literal, loc: SourceLoc): StmtError {
  return {
    type: 'error',
    error,
    loc
  }
}

export function mkBinary(kwargs: Kwarg[], loc: SourceLoc): StmtBinary {
  return {
    type: 'binary',
    kwargs,
    loc
  }
}

export function mkIfElse(cases: [Expr, AsmLine[]][], elseBranch: AsmLine[], loc: SourceLoc): StmtIfElse {
  return {
    type: 'if',
    cases,
    elseBranch: elseBranch !== null ? elseBranch : [],
    loc
  }
}

export function mkFor(index: Ident, list: Expr, body: AsmLine[], loc: SourceLoc): StmtFor {
  return {
    type: 'for',
    index,
    list,
    body,
    loc
  }
}

export function mkMacroArg(ident: Ident): MacroArg {
  return { ident };
}

export function mkMacro(name: Ident, args: MacroArg[] | null, body: AsmLine[], loc: SourceLoc): StmtMacro {
  return {
    type: 'macro',
    name,
    args: args == null ? [] : args,
    body,
    loc
  }
}

export function mkCallMacro(name: ScopeQualifiedIdent, args: Expr[], loc: SourceLoc): StmtCallMacro {
  return {
    type: 'callmacro',
    name,
    args: args == null ? [] : args,
    loc
  }
}

export function mkLet(name: Ident, value: Expr, loc: SourceLoc): StmtLet {
  return {
    type: 'let',
    name,
    value,
    loc
  }
}

export function mkAssign(name: ScopeQualifiedIdent, value: Expr, loc: SourceLoc): StmtAssign {
  return {
    type: 'assign',
    name,
    value,
    loc
  }
}

export function mkStmtExpr(expr: Expr, loc: SourceLoc): StmtExpr {
  return {
    type: 'statement-expr',
    expr,
    loc
  }
}

export function mkLoadPlugin(filename: Literal, moduleName: Ident, loc: SourceLoc): StmtLoadPlugin {
  return {
    type: 'load-plugin',
    filename,
    moduleName,
    loc
  }
}

export function mkFilescope(name: Ident, loc: SourceLoc): StmtFilescope {
  return {
    type: 'filescope',
    name,
    loc
  }
}

export function mkDeclareSegment(name: Ident, kwargs: Kwarg[], loc: SourceLoc): StmtDeclareSegment {
    return {
        type: 'declare-segment',
        name,
        kwargs,
        loc
    }
}

export function mkUseSegment(name: ScopeQualifiedIdent, loc: SourceLoc): StmtUseSegment {
    return {
        type: 'use-segment',
        name,
        loc
    }
}

export function mkAsmLine(
    label: Label | null ,
    stmt: Stmt | null,
    scopedStmts: AsmLine[] | null,
    loc: SourceLoc
  ): AsmLine {
  return { label, stmt, scopedStmts, loc };
}
