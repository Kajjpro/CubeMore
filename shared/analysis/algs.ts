/*
 * THE 57 OLL AND 21 PLL CASES, each with one standard speedsolving algorithm.
 * Algorithms are the common ones from the SpeedSolving wiki (speedsolving.com/wiki,
 * pages "OLL" and "PLL"), written for the cross on the bottom.
 *
 * The algorithms also DEFINE the cases: a state is "OLL 27" when OLL 27's
 * algorithm (after some U turns) orients the last layer. So the case the
 * analyzer recognizes and the algorithm it suggests always match.
 * analysis.test.ts checks every one of them.
 */

export interface LastLayerCase {
  /** "OLL 27", "PLL T". */
  id: string;
  /** The common name, e.g. "Sune". */
  name: string;
  alg: string;
}

const oll = (n: number, name: string, alg: string): LastLayerCase => ({ id: `OLL ${n}`, name, alg });
const pll = (name: string, alg: string): LastLayerCase => ({ id: `PLL ${name}`, name: `${name} perm`, alg });

export const OLL_CASES: LastLayerCase[] = [
  oll(1, "Runway", "R U2' R2' F R F' U2 R' F R F'"),
  oll(2, "Zamboni", "F R U R' U' S R U R' U' f'"),
  oll(3, "Anti-Mouse", "f R U R' U' f' U' F R U R' U' F'"),
  oll(4, "Mouse", "f R U R' U' f' U F R U R' U' F'"),
  oll(5, "Lefty Square", "r' U2' R U R' U r"),
  oll(6, "Righty Square", "r U2 R' U' R U' r'"),
  oll(7, "Lightning", "r U R' U R U2 r'"),
  oll(8, "Reverse Lightning", "r' U' R U' R' U2 r"),
  oll(9, "Kite", "R U R' U' R' F R2 U R' U' F'"),
  oll(10, "Anti-Kite", "R U R' U R' F R F' R U2' R'"),
  oll(11, "Downstairs", "r U R' U R' F R F' R U2' r'"),
  oll(12, "Upstairs", "r R2' U' R U' R' U2 R U' r' R"),
  oll(13, "Gun", "F U R U2' R' U' R U R' F'"),
  oll(14, "Anti-Gun", "R' F R U R' F' R F U' F'"),
  oll(15, "Squeegee", "r' U' r R' U' R U r' U r"),
  oll(16, "Anti-Squeegee", "r U r' R U R' U' r U' r'"),
  oll(17, "Slash", "R U R' U R' F R F' U2 R' F R F'"),
  oll(18, "Crown", "R U2 R2 F R F' U2 M' U R U' r'"),
  oll(19, "Bunny", "r' R U R U R' U' r R2 F R F'"),
  oll(20, "Checkers", "r' R U R U R' U' r R' M' U R U' r'"),
  oll(21, "H", "R U R' U R U' R' U R U2 R'"),
  oll(22, "Pi", "R U2' R2' U' R2 U' R2' U2' R"),
  oll(23, "Headlights", "R2' D' R U2 R' D R U2 R"),
  oll(24, "Chameleon", "r U R' U' r' F R F'"),
  oll(25, "Bowtie", "F R' F' r U R U' r'"),
  oll(26, "Antisune", "R U2 R' U' R U' R'"),
  oll(27, "Sune", "R U R' U R U2' R'"),
  oll(28, "Stealth", "r U R' U' r' R U R U' R'"),
  oll(29, "Spotted Chameleon", "R U R' U' R U' R' F' U' F R U R'"),
  oll(30, "Anti-Spotted Chameleon", "F U R U2' R' U' R U2 R' U' F'"),
  oll(31, "Couch", "R' U' F U R U' R' F' R"),
  oll(32, "Anti-Couch", "R U B' U' R' U R B R'"),
  oll(33, "Shoelaces", "R U R' U' R' F R F'"),
  oll(34, "City", "R U R2' U' R' F R U R U' F'"),
  oll(35, "Fish Salad", "R U2' R2' F R F' R U2' R'"),
  oll(36, "Wario", "L' U' L U' L' U L U L F' L' F"),
  oll(37, "Mounted Fish", "F R' F' R U R U' R'"),
  oll(38, "Mario", "R U R' U R U' R' U' R' F R F'"),
  oll(39, "Fung", "R U R' F' U' F U R U2' R'"),
  oll(40, "Anti-Fung", "R' F R U R' U' F' U R"),
  oll(41, "Awkward Fish", "R U R' U R U2 R' F R U R' U' F'"),
  oll(42, "Lefty Awkward Fish", "R' U' R U' R' U2' R F R U R' U' F'"),
  oll(43, "Anti-P", "R' U' F' U F R"),
  oll(44, "P", "f R U R' U' f'"),
  oll(45, "T", "F R U R' U' F'"),
  oll(46, "Headlights C", "R' U' R' F R F' U R"),
  oll(47, "Anti-Breakneck", "F R' F' R U2 R U' R' U R U2' R'"),
  oll(48, "Breakneck", "F R U R' U' R U R' U' F'"),
  oll(49, "Right Back Squeezy", "r U' r2' U r2 U r2' U' r"),
  oll(50, "Right Front Squeezy", "r' U r2 U' r2' U' r2 U r'"),
  oll(51, "Bottlecap", "f R U R' U' R U R' U' f'"),
  oll(52, "Rice Cooker", "R' F' U' F U' R U R' U R"),
  oll(53, "Frying Pan", "r' U' R U' R' U R U' R' U2 r"),
  oll(54, "Anti-Frying Pan", "r U R' U R U' R' U R U2' r'"),
  oll(55, "Highway", "R' F R U R U' R2' F' R2 U' R' U R U R'"),
  oll(56, "Streetlights", "r U r' U R U' R' U R U' R' r U' r'"),
  oll(57, "Mummy", "R U R' U' M' U R U' r'"),
];

export const PLL_CASES: LastLayerCase[] = [
  pll("Aa", "x R' U R' D2 R U' R' D2 R2 x'"),
  pll("Ab", "x R2 D2 R U R' D2 R U' R x'"),
  pll("E", "x' R U' R' D R U R' D' R U R' D R U' R' D' x"),
  pll("F", "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"),
  pll("Ga", "R2 U R' U R' U' R U' R2 U' D R' U R D'"),
  pll("Gb", "R' U' R U D' R2 U R' U R U' R U' R2 D"),
  pll("Gc", "R2 U' R U' R U R' U R2 U D' R U' R' D"),
  pll("Gd", "R U R' U' D R2 U' R U' R' U R' U R2 D'"),
  pll("H", "M2 U M2 U2 M2 U M2"),
  pll("Ja", "x R2 F R F' R U2 r' U r U2 x'"),
  pll("Jb", "R U R' F' R U R' U' R' F R2 U' R'"),
  pll("Na", "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"),
  pll("Nb", "R' U R U' R' F' U' F R U R' F R' F' R U' R"),
  pll("Ra", "R U' R' U' R U R D R' U' R D' R' U2 R'"),
  pll("Rb", "R' U2 R U2 R' F R U R' U' R' F' R2"),
  pll("T", "R U R' U' R' F R2 U' R' U' R U R' F'"),
  pll("Ua", "R U' R U R U R U' R' U' R2"),
  pll("Ub", "R2 U R U R' U' R' U' R' U R'"),
  pll("V", "R U' R U R' D R D' R U' D R2 U R2 D' R2"),
  pll("Y", "F R U' R' U' R U R' F' R U R' U' R' F R F'"),
  pll("Z", "M' U M2 U M2 U M' U2 M2"),
];

/** The 2-look OLL algorithms people learn first (edges, then corners). */
export const TWO_LOOK_OLL = new Set(["OLL 21", "OLL 22", "OLL 23", "OLL 24", "OLL 25", "OLL 26", "OLL 27", "OLL 33", "OLL 44", "OLL 45"]);
/** The 2-look PLL algorithms (corners, then edges). */
export const TWO_LOOK_PLL = new Set(["PLL Aa", "PLL Ab", "PLL E", "PLL T", "PLL Y", "PLL H", "PLL Ua", "PLL Ub", "PLL Z"]);
