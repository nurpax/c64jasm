// Convert a Javascript object to AST nodes
export function objectToAst(o, loc) {
    if (Array.isArray(o)) {
      return {
        type: 'array',
        values: o.map(e => objectToAst(e, loc)),
        loc
      }
    }
    if (typeof o === 'object') {
      return {
        type: 'object',
        props: Object.keys(o).map(k => {
          return { key: k, val: objectToAst(o[k], loc) };
        }),
        loc
      }
    }
    if (typeof o === 'number') {
      return {
        type: 'literal',
        ival: o,
        loc
      }
    }
    if (typeof o === 'string') {
      return {
        type: 'string',
        string: o,
        loc
      }
    }
    return undefined;
}
