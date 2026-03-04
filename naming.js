function genderedPraenomenFromGens(gensName, sex) {
  // sex: 1 = male, 0 = female

  if (sex === 1) {
    // male
    if (gensName.endsWith('a')) return gensName.slice(0, -1) + 'us';
    if (!gensName.endsWith('us')) return gensName + 'us';
    return gensName;
  } else {
    // female
    if (gensName.endsWith('us')) return gensName.slice(0, -2) + 'a';
    if (!gensName.endsWith('a')) return gensName + 'a';
    return gensName;
  }
}

module.exports = { genderedPraenomenFromGens };