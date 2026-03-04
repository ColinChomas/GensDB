function genderifyNomen(gensName, sex) {
  // sex: 1 = male, 0 = female

  // If the gens ends in -a (Julia, Cornelia, Aemilia)
  if (gensName.endsWith('a')) {
    if (sex === 1) {
      // Female → Male: Julia → Julius, Cornelia → Cornelius
      return gensName.slice(0, -1) + 'us';
    } else {
      // Already feminine
      return gensName;
    }
  }

  // If the gens ends in -us (Julius, Claudius)
  if (gensName.endsWith('us')) {
    if (sex === 0) {
      // Male → Female: Julius → Julia
      return gensName.slice(0, -2) + 'a';
    } else {
      return gensName;
    }
  }

  // Default fallback
  return gensName;
}

module.exports = { genderifyNomen };