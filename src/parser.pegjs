
{
  function mkinsn(mnemonic, imm, abs) {
      return {
          mnemonic,
          imm,
          abs
      }
  }
}

insnLine =
    __ label:label __ insnOrDirective:insnOrDirective __ {
        return { label:label, ...insnOrDirective };
    }
  / __ label:label __ {
        return { label:label, insn:null, directive:null };
    }
  / __ insnOrDirective:insnOrDirective __ {
        return { label:null, ...insnOrDirective };
    }

insnOrDirective =
    instruction:instruction { return { insn: instruction, directive:null }; }
  / directive:directive     { return { insn: null, directive:directive }; }

label = ident:ident ":" { return ident; }

directive =
    "!byte" __ values:exprList        { return { directive: "byte", values: values }; }
  / "!word" __ values:exprList        { return { directive: "byte", values: values }; }

/* TODO actually make this a list */
exprList = expr:expr { return [expr]; }

instruction =
    mnemonic:mnemonic __ imm:imm  { return mkinsn(mnemonic, imm, null); }
  / mnemonic:mnemonic __ abs:abs  { return mkinsn(mnemonic, null, abs); }
  / mnemonic:mnemonic             { return mkinsn(mnemonic, null, null); }

ident = (alpha+ alphanum*)  { return text(); }
mnemonic = ident:ident      { return ident; }

imm = '#' expr:expr { return expr; }

abs = expr:expr { return expr; }

expr = additive

additive = first:multiplicative rest:(__ ('+' / '-') __ multiplicative)+ {
    return rest.reduce(function(memo, curr) {
      return {type: 'binary', op: curr[1], left: memo, right: curr[3]};
    }, first);
}
/ multiplicative

multiplicative = first:primary rest:(__ ('*' / '/' / '%') __ primary)+ {
    return rest.reduce(function(memo, curr) {
      return {type: 'binary', op: curr[1], left: memo, right: curr[3]};
    }, first);
}
/ primary

primary
  = num:num      { return { type: 'literal', value: num }}
  / ident:ident  { return { type: 'ident', name: ident } }
  / "(" __ additive:additive __ ")" { return additive; }


num =
   "$"i hex:$hexdig+ { return parseInt(hex, 16); }
 / digs:$digit+      { return parseInt(digs, 10); }

alpha = [a-zA-Z_]
alphanum = [a-zA-Z_0-9]

digit  = [0-9]
hexdig = [0-9a-f]

ws "whitespace" = [ \t\n\r]*
__ = ws
