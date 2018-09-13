
import * as process from 'process'
import { writeFileSync } from 'fs'
import { assemble } from './asm'
import { ArgumentParser } from 'argparse'

const parser = new ArgumentParser({
    version: '0.0.1',
    addHelp: true,
    description: 'c64jasm'
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
        console.log(err);
    })
    process.exit(1);
}

writeFileSync(args.out, prg, null)
