module.exports = ({readFileSync, resolveRelative}, filename) => {
    const buf = readFileSync(resolveRelative(filename));
    const numSprites = buf.readUInt8(4)+1;
    const data = [];
    for (let i = 0; i < numSprites; i++) {
        const offs = i*64+9;
        const bytes = [];
        for (let j = 0; j < 64; j++) {
            bytes.push(buf.readUInt8(offs + j));
        }
        data.push(bytes);
    }
    return {
        numSprites,
        enableMask: (1<<numSprites)-1,
        bg: buf.readUInt8(6),
        multicol1: buf.readUInt8(7),
        multicol2: buf.readUInt8(8),
        data
    };
}
