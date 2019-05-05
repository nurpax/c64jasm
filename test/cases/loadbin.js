module.exports = ({readFileSync, objectToAst, resolveRelative}, filename) => {
    const buf = readFileSync(resolveRelative(filename));
    const bytes = [];
    for (let i = 0; i < buf.byteLength; i++) {
        bytes.push(buf.readUInt8(i));
    }
    return bytes;
}
