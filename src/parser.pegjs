
{
  var ast = require('./ast')
  var objectToAst = ast.objectToAst

  const emptyInsn = {
      mnemonic: null,
      imm: null,
      abs: null,
      absx: null,
      absy: null,
      absind: null,
      indx: null,
      indy: null
  }
  function mkinsn(mnemonic, imm, abs, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          imm,
          abs,
          loc
      }
  }
  function mkabsx(mnemonic, absx, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          absx,
          loc
      }
  }
  function mkabsy(mnemonic, absy, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          absy,
          loc
      }
  }

  function mkindx(mnemonic, indx, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          indx,
          loc
      }
  }
  function mkindy(mnemonic, indy, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          indy,
          loc
      }
  }

  function mkabsind(mnemonic, absind, loc) {
      return {
          ...emptyInsn,
          mnemonic,
          absind,
          loc
      }
  }

  function extractList(list, index) {
    return list.map(function(element) { return element[index]; });
  }

  function buildList(head, tail, index) {
    return [head].concat(extractList(tail, index));
  }

  function loc() {
    return { ...location(), source: options.source }
  }
}

statements =
    head:insnLineWithComment tail:("\n" __ insnLineWithComment)* {
      return buildList(head, tail, 2);
    }

insnLineWithComment =
  insn:insnLine (';' (!'\n' .)*)? {
    return insn
  }

insnLine =
    label:label LWING scopedStmts:statements RWING {
      return ast.mkAsmLine(label, null, scopedStmts, loc());
  }
  / label:label stmt:statement {
      return ast.mkAsmLine(label, stmt, null, loc());
    }
  / label:label {
      return ast.mkAsmLine(label, null, null, loc());
    }
  / stmt:statement {
      return ast.mkAsmLine(null, stmt, null, loc());
    }
  / pc:setPC {
      return ast.mkAsmLine(null, pc, null, loc());
    }
  / __ {
    // empty line is a no-op
    return ast.mkAsmLine(null, null, null, loc());
  }

statement =
    directive:directive     { return directive; }
  / instruction:instruction { return ast.mkInsn(instruction, loc()); }

label = lbl:identNoWS ":" __  { return ast.mkLabel(lbl, loc()); }

setPC = STAR EQU pc:expr { return ast.mkSetPC(pc, loc()); }

directive =
    size:(PSEUDO_BYTE / PSEUDO_WORD) values:exprList  {
      const dataSize = size == 'byte' ? ast.DataSize.Byte : ast.DataSize.Word;
      return ast.mkData(dataSize, values, loc());
    }
  / PSEUDO_FILL numBytes:expr COMMA fillValue:expr {
      return ast.mkFill(numBytes, fillValue, loc());
    }
  / PSEUDO_INCLUDE filename:expr {
      return ast.mkInclude(filename, loc());
    }
  / PSEUDO_BINARY s:expr extra:(COMMA expr? COMMA expr)?  {
      let size = null
      let offset = null
      if (extra !== null) {
        size = extra[1]
        offset = extra[3]
      }
      return ast.mkBinary(s, size, offset, loc());
    }
  / PSEUDO_IF LPAR condition:expr RPAR LWING trueBranch:statements RWING
    elifs:elif*
    elseBody:elseBody? {
      const conds = [condition, ...elifs.map(e => e.condition)]
      const trueBodies = [trueBranch, ...elifs.map(e => e.trueBranch)]
      const cases = conds.map((c,i) => [c, trueBodies[i]])
      return ast.mkIfElse(cases, elseBody, loc());
    }
  / PSEUDO_FOR index:identifier "in" __ list:expr LWING body:statements RWING {
      return ast.mkFor(index, list, body, loc());
    }
  / PSEUDO_MACRO name:macroName LPAR args:macroArgNameList? RPAR LWING body:statements RWING {
      return ast.mkMacro(name, args, body, loc());
    }
  / "+" name:scopeQualifiedIdentifier LPAR args:exprList? RPAR  {
      return ast.mkCallMacro(name, args, loc());
    }
  / PSEUDO_LET name:identifier EQU value:expr { return ast.mkLet(name, value, loc()); }
  / name:scopeQualifiedIdentifier EQU value:expr {
      return ast.mkAssign(name, value, loc());
    }
  / PSEUDO_USE filename:string "as" __ plugin:identifier {
      return ast.mkLoadPlugin(filename, plugin, loc());
    }
  / PSEUDO_ERROR error:string {
      return ast.mkError(error, loc());
    }
  / PSEUDO_ALIGN alignBytes:expr {
      return ast.mkAlign(alignBytes, loc());
    }
  / PSEUDO_FILESCOPE name:identifier {
      return ast.mkFilescope(name, loc());
    }

elif = PSEUDO_ELIF LPAR condition:expr RPAR LWING trueBranch:statements RWING {
  return { condition, trueBranch };
}

elseBody = PSEUDO_ELSE LWING elseBody:statements RWING {
  return elseBody;
}

string
  = '"' chars:doubleStringCharacter* '"' __ { return ast.mkLiteral(chars.join(''), loc()); }

doubleStringCharacter
  = !'"' char:. { return char; }

macroName = name:ident { return ast.mkIdent(name, loc()); }

macroArgNameList = head:macroArgName tail:(COMMA macroArgName)* { return buildList(head, tail, 1); }
macroArgName =
  ident:identifier { return ast.mkMacroArg(ident); }

exprList = head:expr tail:(COMMA expr)* { return buildList(head, tail, 1); }

instruction =
    mnemonic:mnemonic imm:imm  {
      return mkinsn(mnemonic, imm, null, loc());
    }
  / mnemonic:mnemonic LPAR abs:abs COMMA "x" __ RPAR {
      // lda ($zp,x) indirect indexed
      return mkindx(mnemonic, abs, loc());
    }
  / mnemonic:mnemonic LPAR abs:abs RPAR COMMA "y" __ {
      // lda ($zp),y indirect indexed
      return mkindy(mnemonic, abs, loc());
    }
  / mnemonic:mnemonic LPAR abs:abs RPAR {
      // absolute indirect.  only possible form: jmp ($fffc)
      return mkabsind(mnemonic, abs, loc());
    }
  / mnemonic:mnemonic abs:abs COMMA r:("x" / "y") __ {
      if (r === 'x') {
        return mkabsx(mnemonic, abs, loc());
      }
      return mkabsy(mnemonic, abs, loc());
    }
  / mnemonic:mnemonic abs:abs  { return mkinsn(mnemonic, null, abs, loc()); }
  / mnemonic:mnemonic          { return mkinsn(mnemonic, null, null, loc()); }

identNoWS = (alpha+ alphanum*) { return text(); }

labelIdent =
    ident:identNoWS __         { return ident; }

scopeQualifiedIdentifier =
    head:identNoWS tail:('::' identNoWS)* __ {
      return ast.mkScopeQualifiedIdent(buildList(head, tail, 1), false, loc());
    }
  / '::' head:identNoWS tail:('::' identNoWS)* __ {
      return ast.mkScopeQualifiedIdent(buildList(head, tail, 1), true, loc());
    }

identifier = ident:ident {
  return ast.mkIdent(ident, loc());
}

ident = sym:identNoWS __       { return sym; }
mnemonic = ident:identNoWS __  { return ident; }

imm = '#' lh:loOrHi? expr:expr {
  if (lh !== null) {
    if (lh === 'lo') {
      return ast.mkBinaryOp('&', expr, ast.mkLiteral(255, loc(), loc()));
    }
    const lit8 = ast.mkLiteral(8, loc());
    const lit255 = ast.mkLiteral(255, loc());
    return ast.mkBinaryOp('&', ast.mkBinaryOp('>>', expr, lit8, loc()), lit255, loc());
  }
  return expr
}

loOrHi =
    LT { return 'lo'; }
  / GT { return 'hi'; }

abs = expr:expr { return expr; }

expr = lastExpr

multiplicative = first:unaryExpression rest:((STAR / DIV / MOD) unaryExpression)* {
    return rest.reduce(function(memo, curr) {
      return ast.mkBinaryOp(curr[0], memo, curr[1], loc());
    }, first);
  }
/ primary

additive = first:multiplicative rest:((PLUS / MINUS) multiplicative)* {
    return rest.reduce(function(memo, curr) {
      return ast.mkBinaryOp(curr[0], memo, curr[1], loc());
    }, first);
  }

shift = first:additive rest:((LEFT / RIGHT) additive)* {
    return rest.reduce(function(memo, curr) {
      return ast.mkBinaryOp(curr[0], memo, curr[1], loc());
    }, first);
  }

relational = first:shift rest:((LE / GE / LT / GT) shift)* {
    return rest.reduce(function(memo, curr) {
      return ast.mkBinaryOp(curr[0], memo, curr[1], loc());
    }, first);
  }

equality = first:relational rest:((EQUEQU / BANGEQU) relational)* {
    return rest.reduce(function(memo, curr) {
      return ast.mkBinaryOp(curr[0], memo, curr[1], loc());
    }, first);
  }

andExpr = first:equality rest:(AND equality)* {
    return rest.reduce(function(memo, curr) {
      return ast.mkBinaryOp(curr[0], memo, curr[1], loc());
    }, first);
  }

xorExpr = first:andExpr rest:(HAT andExpr)* {
    return rest.reduce(function(memo, curr) {
      return ast.mkBinaryOp(curr[0], memo, curr[1], loc());
    }, first);
  }

orExpr = first:xorExpr rest:(OR xorExpr)* {
    return rest.reduce(function(memo, curr) {
      return ast.mkBinaryOp(curr[0], memo, curr[1], loc());
    }, first);
  }

boolAndExpr = first:orExpr rest:(ANDAND orExpr)* {
    return rest.reduce(function(memo, curr) {
      return ast.mkBinaryOp(curr[0], memo, curr[1], loc());
    }, first);
  }

boolOrExpr = first:boolAndExpr rest:(OROR boolAndExpr)* {
    return rest.reduce(function(memo, curr) {
      return ast.mkBinaryOp(curr[0], memo, curr[1], loc());
    }, first);
  }

// TODO cond?a:b
// ConditionalExpression <- LogicalORExpression (QUERY Expression COLON LogicalORExpression)*

lastExpr = boolOrExpr

unaryExpression =
   callOrMemberExpression
 / op:unaryOperator expr:unaryExpression {
   return ast.mkUnary(op, expr, loc());
 }

unaryOperator = op:(PLUS / MINUS / TILDA / BANG) { return op };

callOrMemberExpression =
  callExpression
/ memberExpression

memberExpression =
  head:primary tail:(
      LBRK property:lastExpr RBRK {
        return { property, computed: true };
      }
    / DOT property:labelIdent {
        return { property: ast.mkIdent(property, loc()), computed: false };
      }
  )* {
      return tail.reduce(function(result, element) {
        return ast.mkMember(result, element.property, element.computed, loc());
      }, head);
  }

callExpression =
  callee:memberExpression LPAR args:exprList? RPAR {
    return ast.mkCallFunc(callee, args, loc());
  }

primary
  = num:num                        { return ast.mkLiteral(num, loc()); }
  / ident:scopeQualifiedIdentifier { return ident; }
  / string:string                  { return string; }
  / arrayLiteral
  / LPAR e:lastExpr RPAR           { return e; }

num =
   "$"i hex:$hexdig+ __     { return parseInt(hex, 16); }
 / "%" binary:$zeroone+ __  { return parseInt(binary, 2); }
 / digs:$digit+      __     { return parseInt(digs, 10); }

arrayLiteral =
  LBRK elts:exprList? RBRK {
    return ast.mkExprArray(elts === null ? [] : elts, loc());
  }

alpha = [a-zA-Z_]
alphanum = [a-zA-Z_0-9]

digit   = [0-9]
zeroone = [0-1]
hexdig  = [0-9a-f]

ws "whitespace" = [ \t\r]*
__ = ws

PSEUDO_ALIGN     = "!align" ws
PSEUDO_BYTE      = "!byte" ws { return 'byte'; }
PSEUDO_WORD      = "!word" ws { return 'word'; }
PSEUDO_BINARY    = "!binary" ws
PSEUDO_LET       = "!let" ws
PSEUDO_MACRO     = "!macro" ws
PSEUDO_IF        = "!if" ws
PSEUDO_ELSE      = "else" ws
PSEUDO_ELIF      = "elif" ws
PSEUDO_ERROR     = "!error" ws
PSEUDO_FOR       = "!for" ws
PSEUDO_INCLUDE   = "!include" ws
PSEUDO_FILL      = "!fill" ws
PSEUDO_USE       = "!use" ws
PSEUDO_FILESCOPE = "!filescope" ws

LBRK      =  s:'['         ws { return s; }
RBRK      =  s:']'         ws { return s; }
LPAR      =  s:'('         ws { return s; }
RPAR      =  s:')'         ws { return s; }
LWING     =  s:'{'         ws { return s; }
RWING     =  s:'}'         ws { return s; }
DOT       =  s:'.'         ws { return s; }
PTR       =  s:'->'        ws { return s; }
INC       =  s:'++'        ws { return s; }
DEC       =  s:'--'        ws { return s; }
AND       =  s:'&'  ![&]   ws { return s; }
STAR      =  s:'*'  ![=]   ws { return s; }
PLUS      =  s:'+'  ![+=]  ws { return s; }
MINUS     =  s:'-'  ![\-=>] ws { return s; }
TILDA     =  s:'~'         ws { return s; }
BANG      =  s:'!'  ![=]   ws { return s; }
DIV       =  s:'/'  ![=]   ws { return s; }
MOD       =  s:'%'  ![=>]  ws { return s; }
LEFT      =  s:'<<' ![=]   ws { return s; }
RIGHT     =  s:'>>' ![=]   ws { return s; }
LT        =  s:'<'  ![=]   ws { return s; }
GT        =  s:'>'  ![=]   ws { return s; }
LE        =  s:'<='        ws { return s; }
GE        =  s:'>='        ws { return s; }
EQUEQU    =  s:'=='        ws { return s; }
BANGEQU   =  s:'!='        ws { return s; }
HAT       =  s:'^'  ![=]   ws { return s; }
OR        =  s:'|'  ![=]   ws { return s; }
ANDAND    =  s:'&&'        ws { return s; }
OROR      =  s:'||'        ws { return s; }
QUERY     =  s:'?'         ws { return s; }
COLON     =  s:':'  ![>]   ws { return s; }
SEMI      =  s:';'         ws { return s; }
ELLIPSIS  =  s:'...'       ws { return s; }
EQU       =  s:'='  !"="   ws { return s; }
STAREQU   =  s:'*='        ws { return s; }
DIVEQU    =  s:'/='        ws { return s; }
MODEQU    =  s:'%='        ws { return s; }
PLUSEQU   =  s:'+='        ws { return s; }
MINUSEQU  =  s:'-='        ws { return s; }
LEFTEQU   =  s:'<<='       ws { return s; }
RIGHTEQU  =  s:'>>='       ws { return s; }
ANDEQU    =  s:'&='        ws { return s; }
HATEQU    =  s:'^='        ws { return s; }
OREQU     =  s:'|='        ws { return s; }
COMMA     =  s:','         ws { return s; }

EOT       =  !.
