#!/usr/bin/env node

import * as process from 'process'
import { writeFileSync } from 'fs'
import { assemble } from './asm'
import { ArgumentParser } from 'argparse'
import * as watch from 'node-watch'

function compile(args) {
    const hrstart = process.hrtime();

    const { errors, prg } = assemble(args.source);

    if (errors.length !== 0) {
        errors.forEach(err => {
            console.log(err.formatted);
        })
        process.exit(1);
    }
    writeFileSync(args.out, prg, null)

    if (args.verbose) {
        const NS_PER_SEC = 1e9;
        const diff = process.hrtime(hrstart);
        const deltaNS = diff[0] * NS_PER_SEC + diff[1];
        console.info('Compilation completed %d ms', Math.floor((deltaNS/1000000.0)*100)/100);
    }
}

const version = require('../../package.json').version

const parser = new ArgumentParser({
    version,
    addHelp: true,
    prog: 'c64jasm',
    description: 'C64 macro assembler'
});

parser.addArgument('--verbose', {
    action:'storeConst',
    constant:true
});

parser.addArgument('--out', { help: 'Output .prg filename' })
parser.addArgument('--watch', {
    action:'append',
    help: 'Watch directories/files and recompile on changes.  Add multiple --watch args if you want to watch for multiple dirs/files.'
});
parser.addArgument('source', {help: 'Input .asm file'})

const args = parser.parseArgs();

if (args.out === null) {
    console.log('Must specify output .prg filename');
    process.exit(1);
}

console.log(`Compiling ${args.source}`)
if (args.watch) {
    watch(args.watch, { recursive:true }, () => compile(args))
} else {
    compile(args)
}
