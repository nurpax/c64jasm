
module.exports = {
    div2: function (ctx, x) {
        return x/2;
    },
    mul2: (ctx, x) => x*2,
    nestedArray: () => {
        return [
            [{x: 0, y: 1 }, {x: 4, y: 5}],
            [{x: 5, y: 6 }, {x: 7, y: 8}]
        ]
    }
}
