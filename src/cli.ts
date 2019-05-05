#!/usr/bin/env node

import * as process from 'process'
import { sprintf } from 'sprintf-js'

import * as net from 'net';
import { writeFileSync } from 'fs'
import { assemble } from './asm'
import { ArgumentParser } from 'argparse'
import { toHex16 } from './util'

const chokidar = require('chokidar');

let args: any = null;
let latestSuccessfulCompile: any = undefined;

const PORT = 6502;
const HOST = 'localhost';

// TODO maybe better to use HTTP for this?
function startDebugInfoServer() {
    var server = net.createServer(onConnected);

    server.listen(PORT, HOST, function() {
        console.log('server listening on %j', server.address());
    });

    function onConnected(sock: net.Socket) {
        var remoteAddress = sock.remoteAddress + ':' + sock.remotePort;
        console.log('new client connected: %s', remoteAddress);

        sock.on('data', function(data: string) {
            if (data.toString().trim() == 'debug-info') {
                sock.write(JSON.stringify({
                    outputPrg: args.out,
                    debugInfo: latestSuccessfulCompile.debugInfo.info()
                }))
                sock.end();
            }
            console.log('%s Says: %s', remoteAddress, data);
        });
        sock.on('close',  function () {
            console.log('connection from %s closed', remoteAddress);
        });
    }
}

function compile(args: any) {
    console.log(`Compiling ${args.source}`)
    const hrstart = process.hrtime();

    const result = assemble(args.source);
    if (!result) {
        return;
    }
    const { errors, prg, labels } = result;

    if (errors.length !== 0) {
        errors.forEach(err => {
            console.log(err.formatted);
        })
        console.log('Compilation failed.')
        return false;
    }
    latestSuccessfulCompile = result;
    writeFileSync(args.out, prg, null)
    console.log(`Compilation succeeded.  Output written to ${args.out}`)

    if (args.verbose) {
        const NS_PER_SEC = 1e9;
        const diff = process.hrtime(hrstart);
        const deltaNS = diff[0] * NS_PER_SEC + diff[1];
        console.info('Compilation completed %d ms', Math.floor((deltaNS/1000000.0)*100)/100);
    }

    if (args.dumpLabels) {
        labels.forEach(({name, addr, size}) => {
            const msg = sprintf("%s %4d %s", toHex16(addr), size, name);
            console.log(msg);
        })
    }
    return true;
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
// Server for debuggers to connect to for program information
parser.addArgument('--server', {
    action:'storeConst',
    constant: true,
    dest: 'startServer',
    help: 'Start a debug info server that debuggers can call to ask for latest successful compile results.  Use with --watch'
});
parser.addArgument('--dump-labels', {
    action:'storeConst',
    constant: true,
    dest: 'dumpLabels',
    help: 'Dump program address and size for all labels declared in the source files.'
});
parser.addArgument('source', {help: 'Input .asm file'})

args = parser.parseArgs();

if (args.out === null) {
    console.log('Must specify output .prg filename');
    process.exit(1);
}

const ok = compile(args);
if (!ok && !args.watch) {
    process.exit(1);
}

if (args.watch) {
    const watcher = chokidar.watch(args.watch, {
        recursive:true
    })
    startDebugInfoServer();
    watcher.on('change', (path: string, stats: any) => compile(args));
}
