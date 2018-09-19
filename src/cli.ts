#!/usr/bin/env node

import * as process from 'process'
import { writeFileSync } from 'fs'
import { assemble } from './asm'
import { ArgumentParser } from 'argparse'

const version = require('../../package.json').version

const parser = new ArgumentParser({
    version,
    addHelp: true,
    prog: 'c64jasm',
    description: 'C64 macro assembler'
});

parser.addArgument('--out', {help: 'Output .prg filename'})
parser.addArgument('source', {help: 'Input .asm file'})

const args = parser.parseArgs();

if (args.out === null) {
    console.log('Must specify output .prg filename');
    process.exit(1);
}

const { errors, prg } = assemble(args.source);

if (errors.length !== 0) {
    errors.forEach(err => {
        console.log(err.formatted);
    })
    process.exit(1);
}

writeFileSync(args.out, prg, null)
