
module.exports = ({}, arg0) => {
    if (arg0 < 5) {
        return arg0;
    }
    throw new Error('arg0 must be less than 5');
}
