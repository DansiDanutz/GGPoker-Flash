// The public lobby is polled frequently. Verify once per stored password hash.
export function demoAvailability(verify) {
  let previousHash, matches = false;
  return hash => {
    if (hash !== previousHash) {
      matches = !!hash && verify('ggpoker', hash);
      previousHash = hash;
    }
    return matches;
  };
}
