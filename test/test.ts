
var glob = require('glob-fs')();

import { assemble } from '../src/asm'
import { disassemble } from '../src/disasm'

function main() {
    let inputs = glob.readdirSync('test/cases/*.input.asm');

    for (let i = 0; i < inputs.length; i++) {
        const fname = inputs[i];
        console.log('Testcase', fname)

        try {
            const prg = assemble(fname);

            disassemble(prg);
        } catch(err) {
            console.error(err);
        }
    }
}

main();
