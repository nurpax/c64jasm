
var glob = require('glob-fs');
import { argv } from 'process'
import * as path from 'path';
import * as fs from 'fs';

import { assemble } from '../src/asm'
import { disassemble } from '../src/disasm'

function readLines(fname) {
    const lines = fs.readFileSync(fname).toString().split('\n');
    return lines.map(line => line.trimRight());
}

function outputTest() {
    const g = glob();
    let inputs = g.readdirSync('test/cases/*.input.asm');

    const last = argv[argv.length-1];
    if (path.extname(last) === '.asm') {
        inputs = [path.join('test/cases', path.basename(last))];
    }

    for (let testIdx = 0; testIdx < inputs.length; testIdx++) {
        const fname = inputs[testIdx];
        console.log('Testcase:', fname);

        try {
            const { prg, errors } = assemble(fname);

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

function testErrors() {
    const g = glob();
    let inputs = g.readdirSync('test/errors/*.input.asm');

    const last = argv[argv.length-1];
    if (path.extname(last) === '.asm') {
        inputs = [path.join('test/errors', path.basename(last))];
    }

    for (let testIdx = 0; testIdx < inputs.length; testIdx++) {
        const fname = inputs[testIdx];
        console.log('Testcase:', fname);

        try {
            const { prg, errors } = assemble(fname);

            const errorsFname = path.join(path.dirname(fname), path.basename(fname, 'input.asm') + 'errors.txt');

            // If the expected file doesn't exist, create it.  This is for new test authoring.
            if (!fs.existsSync(errorsFname)) {
                fs.writeFileSync(errorsFname, errors.join('\n'))
                console.log(`  DEBUG: wrote ${errorsFname}`);
            } else {
                const expectedErrors = readLines(errorsFname);
                for (let ei in expectedErrors) {
                    const emsg = /^.*:.* - (.*)$/.exec(expectedErrors[ei]);
                    const msgOnly = emsg[1];

                    const found = errors.some((msg) => {
                        const m = /^.*:.* - (.*)$/.exec(msg);
                        return m ? m[1] == msgOnly : false;
                    });
                    if (!found) {
                        const actualFname = path.join(path.dirname(fname), path.basename(fname, 'input.asm') + 'actual_errors.txt');
                        fs.writeFileSync(actualFname, errors.join('\n'))
                        console.error(`Assembler output does not contain errors listed in

${errorsFname}

Actual errors written into

${actualFname}
                        `);
                    }
                }
            }
        } catch(err) {
            console.error(err);
        }
    }
}

console.log('Assemble/disassembe tests\n')
outputTest();
console.log('\nError reporting tests\n')
testErrors();
