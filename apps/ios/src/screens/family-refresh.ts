export function createFamilyRefreshGate() {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    isCurrent(generation: number) {
      return generation === current;
    },
  };
}
