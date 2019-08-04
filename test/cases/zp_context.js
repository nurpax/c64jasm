
module.exports = {
  create: ({}, initial) => {
    const stack = [initial];
    return {
      push: (elt) => {
        stack.push(elt)
      },
      pop: () => stack.pop(),
      top: () => {
        return stack[stack.length-1];
      }
    }
  }
}
