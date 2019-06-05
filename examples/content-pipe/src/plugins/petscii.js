
function groupSame(values) {
    let cur = undefined;
    let out = [];

    for (let v of values) {
        // Start new run
        if (cur !== v) {
            cur = v;
            out.push({code: cur, count: 1});
        } else {
            // Keep growing current group
            out[out.length-1].count++;
        }
    }
    return out;
}

module.exports = {
    rlePetsciiJson: (ctx, filename) =>  {
        const { readFileSync, resolveRelative } = ctx;
        const json = JSON.parse(readFileSync(resolveRelative(filename)));

        const fb = json.framebufs[0];
        const { width, height } = fb;

        const colors = [];
        const screencodes = [];
        const interleaved = [];

        for (let y = 0; y < height; y++) {

            const screen = groupSame(fb.screencodes.slice(y*width, (y+1)*width));
            const rowScr = screen.flatMap(g => [g.count, g.code]);

            // TODO pack colors to 8 bit two pix packets
            const color = groupSame(fb.colors.slice(y*width, (y+1)*width));
            const rowCol = color.flatMap(g => [g.count, g.code]);

            screencodes.push(...rowScr);
            colors.push(...rowCol);

            interleaved.push(...rowScr);
            interleaved.push(...rowCol);
        }
        return {
            screencodes,
            colors,
            interleaved
        }
    }
}

/*
function test() {
    const fs = require('fs')
    const loader = fname => module.exports.rlePetsciiJson({readFileSync:fs.readFileSync, resolveRelative:(f) => f}, fname);
    const r = loader('src/assets/phys-bg2.json');
    console.log(JSON.stringify(r, null, 2));
}

test();
*/