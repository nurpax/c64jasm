
module.exports = {
    sintab: ({}, len, scale) => {
        const res = Array(len.lit).fill(0).map((v,i) => Math.sin(i/len.lit * Math.PI * 2.0) * scale.lit);
        return res;
    }
}
