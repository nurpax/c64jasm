
module.exports = {
    div2: function (ctx, x) {
        return x/2;
    },
    mul2: (ctx, x) => x*2,
    div: function (ctx, a, b) {
        if (b == 0) {
            throw new Error('div by zero');
        }
        return a / b;
    }
}
