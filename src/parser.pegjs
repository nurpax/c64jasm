
{
  const emptyInsn = {
      mnemonic: null,
      imm: null,
      abs: null,
      absx: null,
      absy: null,
      absind: null
  }
  function mkinsn(mnemonic, imm, abs) {
      return {
          ...emptyInsn,
          mnemonic,
          imm,
          abs
      }
  }
  function mkabsx(mnemonic, absx) {
      return {
          ...emptyInsn,
          mnemonic,
          absx
      }
  }
  function mkabsy(mnemonic, absy) {
      return {
          ...emptyInsn,
          mnemonic,
          absy
      }
  }
  function mkabsind(mnemonic, absind) {
      return {
          ...emptyInsn,
          mnemonic,
          absind
      }
  }

  function extractList(list, index) {
    return list.map(function(element) { return element[index]; });
  }

  function buildList(head, tail, index) {
    return [head].concat(extractList(tail, index));
  }

  function binop(op, left, right) {
    return {
      type: 'binary',
      op,
      left,
      right
    }
  }

  function iconst(value) {
    return {
      type: 'literal',
      value
    }
  }
}

statements = 
    head:insnLine __ tail:("\n" __ insnLine __)* {
      return buildList(head, tail, 2);
    }

insnLine =
    __ label:label __ stmt:statement {
      return { label:label, stmt };
    }
  / __ label:label {
      return { label:label, stmt:null };
    }
  / __ stmt:statement {
      return { label:null, stmt };
    }
  / __ pc:setPC {
      return { label: null, stmt:pc }
    }
  / __ {
    // empty line is a no-op
    return null
  }

statement =
    instruction:instruction { 
      return {
        type: 'insn',
        insn: instruction
      }
    }
  / directive:directive { return directive; }

label = ident:ident ":" { return ident; }

setPC =
  "*" __ "=" __ pc:expr { 
    return { 
      type: 'setpc',
      pc
    }; 
  }

directive =
    "!byte" __ values:exprList  { 
      return { 
        type: 'byte',
        values
      }; 
    }
  / "!word" __ values:exprList { 
      return { 
        type: 'word',
        values: values 
      }; 
    }
  / "!binary" __ s:string __ extra:("," __ expr? __ "," __ expr __)?  {
      let size = null
      let offset = null
      if (extra !== null) {
        size = extra[2]
        offset = extra[6]
      }
      return { 
        type: 'binary',
        filename: s, 
        size, 
        offset 
      };
    }
  / "!if" __ "(" __ condition:expr __ ")"  __ "{" __ trueBranch:statements __ "}" {
      return {
        type: 'if',
        cond:condition,
        trueBranch
      };
    }

string
  = '"' chars:doubleStringCharacter* '"' { return chars.join(''); }

doubleStringCharacter
  = !'"' char:. { return char; }

/* TODO actually make this a list */
exprList = head:expr tail:(__ "," __ expr)* { return buildList(head, tail, 3); }

instruction =
    mnemonic:mnemonic __ imm:imm  { return mkinsn(mnemonic, imm, null); }
  / mnemonic:mnemonic __ "(" __ abs:abs ")"  {
      // absolute indirect.  only possible form: jmp ($fffc)
      return mkabsind(mnemonic, abs);
    }
  / mnemonic:mnemonic __ abs:abs __ "," __ r:("x"/"y")  {
      if (r === 'x') {
        return mkabsx(mnemonic, abs);
      }
      return mkabsy(mnemonic, abs);
    }
  / mnemonic:mnemonic __ abs:abs  { return mkinsn(mnemonic, null, abs); }
  / mnemonic:mnemonic             { return mkinsn(mnemonic, null, null); }

ident = (alpha+ alphanum*)  { return text(); }
mnemonic = ident:ident      { return ident; }

imm = '#' lh:loOrHi? __ expr:expr { 
  if (lh !== null) {
    if (lh === 'lo') {
      return binop('&', expr, iconst(255))
    }
    return binop('&', binop('>>', expr, iconst(8)), iconst(255));
  }
  return expr
}

loOrHi = 
    "<" { return 'lo'; }
  / ">" { return 'hi'; }

abs = expr:expr { return expr; }

expr = additive

additive = first:multiplicative rest:(__ ('+' / '-') __ multiplicative)+ {
    return rest.reduce(function(memo, curr) {
      return binop(curr[1], memo, curr[3]);
    }, first);
}
/ multiplicative

multiplicative = first:primary rest:(__ ('*' / '/' / '%') __ primary)+ {
    return rest.reduce(function(memo, curr) {
      return binop(curr[1], memo, curr[3]);
    }, first);
}
/ primary

primary
  = num:num      { return iconst(num); }
  / ident:ident  { return { type: 'ident', name: ident } }
  / "(" __ additive:additive __ ")" { return additive; }


num =
   "$"i hex:$hexdig+ { return parseInt(hex, 16); }
 / digs:$digit+      { return parseInt(digs, 10); }

alpha = [a-zA-Z_]
alphanum = [a-zA-Z_0-9]

digit  = [0-9]
hexdig = [0-9a-f]

ws "whitespace" = [ \t\r]*
__ = ws
