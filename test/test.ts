
var glob = require('glob-fs')();
import * as path from 'path';
import * as fs from 'fs';

import { assemble } from '../src/asm'
import { disassemble } from '../src/disasm'

function readLines(fname) {
    const lines = fs.readFileSync(fname).toString().split('\n');
    return lines.map(line => line.trimRight());
}

function main() {
    let inputs = glob.readdirSync('test/cases/*.input.asm');

    for (let testIdx = 0; testIdx < inputs.length; testIdx++) {
        const fname = inputs[testIdx];
        console.log('Testcase:', fname)

        try {
            const prg = assemble(fname);

            const disasmLines = disassemble(prg).concat('');
            const expectedFname = path.join(path.dirname(fname), path.basename(fname, 'input.asm') + 'expected.asm');
            const actualFname = path.join(path.dirname(fname), path.basename(fname, 'input.asm') + 'actual.asm');

            // If the expected file doesn't exist, create it.  This is for new test authoring.
            if (!fs.existsSync(expectedFname)) {
                fs.writeFileSync(expectedFname, disasmLines.join('\n'))
                console.log(`  DEBUG: wrote ${expectedFname}`);
            } else {
                const expectedLines = readLines(expectedFname);
                for (let lineIdx = 0; lineIdx < expectedLines.length; lineIdx++) {
                    if (expectedLines[lineIdx].trim() != disasmLines[lineIdx]) {
                        fs.writeFileSync(actualFname, disasmLines.join('\n')+'\n');
                        console.error(`Test failed.
Input .asm:

cat ${fname}

First delta on line ${lineIdx+1}.

Expected disassembly (from ${expectedFname}):

${expectedLines.join('\n')}

Actual disassembly (also written into ${actualFname}):

${disasmLines.join('\n')}
`
                        );
                        break;
                    }
                }
            }
        } catch(err) {
            console.error(err);
        }
    }
}

main();
