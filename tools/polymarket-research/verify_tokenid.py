"""
End-to-end verification of Polymarket / Gnosis CTF token-ID derivation, reproduced from
CTHelpers.sol and checked against LIVE clobTokenIds:

    conditionId  = keccak256(oracle || questionId || uint256(outcomeSlotCount))     [verified elsewhere]
    collectionId = getCollectionId(0, conditionId, indexSet)   # alt_bn128 hash-to-point
    positionId   = uint256(keccak256(collateral || collectionId))   # == the ERC-1155 clobTokenId

For a binary market: outcome 0 -> indexSet 0b01 = 1 ; outcome 1 -> indexSet 0b10 = 2.
parentCollectionId = 0 for top-level markets, so the ecAdd branch is skipped.
"""
from Crypto.Hash import keccak

P = 21888242871839275222246405745257275088696311157297823662689037894645226208583  # alt_bn128 field
B = 3
# Polymarket collateral on Polygon = USDC.e
COLLATERAL = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"

def k256(b):
    h = keccak.new(digest_bits=256); h.update(b); return h.digest()

def sqrt_mod(a):
    # P % 4 == 3  ->  sqrt(a) = a^((P+1)/4) mod P
    return pow(a, (P + 1) // 4, P)

def get_collection_id(condition_id_hex, index_set, parent=0):
    assert parent == 0, "only top-level (parent=0) implemented"
    packed = bytes.fromhex(condition_id_hex[2:]) + index_set.to_bytes(32, "big")  # abi.encodePacked(bytes32,uint256)
    x1 = int.from_bytes(k256(packed), "big")
    odd = (x1 >> 255) != 0
    while True:                                   # do { x1+=1; yy=x1^3+3; y1=sqrt(yy) } while(y1^2 != yy)
        x1 = (x1 + 1) % P
        yy = (x1 * x1 % P) * x1 % P
        yy = (yy + B) % P
        y1 = sqrt_mod(yy)
        if (y1 * y1 % P) == yy:
            break
    if (odd and y1 % 2 == 0) or ((not odd) and y1 % 2 == 1):
        y1 = P - y1
    if y1 % 2 == 1:
        x1 ^= (1 << 254)
    return x1.to_bytes(32, "big")

def get_position_id(collection_id_bytes, collateral_hex=COLLATERAL):
    packed = bytes.fromhex(collateral_hex[2:]) + collection_id_bytes  # abi.encodePacked(address,bytes32)
    return int.from_bytes(k256(packed), "big")

def run_full_snapshot():
    import json, gzip
    mk = json.load(gzip.open("data/markets.json.gz", "rt"))
    res = {True: [0, 0], False: [0, 0]}
    for m in mk:
        c = m.get("conditionId")
        try:
            toks = json.loads(m["clobTokenIds"]); outs = json.loads(m["outcomes"])
        except Exception:
            continue
        if not (c and toks and len(toks) == 2):
            continue
        nr = bool(m.get("negRisk"))
        yes = str(get_position_id(get_collection_id(c, 1)))
        no  = str(get_position_id(get_collection_id(c, 2)))
        match = {yes, no} == {str(toks[0]), str(toks[1])}
        res[nr][0] += int(match); res[nr][1] += 1
    print("=== FULL SNAPSHOT token-ID derivation match ===")
    for nr in (False, True):
        mt, tot = res[nr]
        print(f"  negRisk={str(nr):5}  {mt}/{tot}  ({100*mt/tot if tot else 0:.1f}%)")
    print()

# (name, negRisk, conditionId, [expected YES token, expected NO token])
cases = [
 ("Trump WC Photo", False, "0xc0b7319f73f248310b059c231fb069e64dbd68ca81dd9933728ca192b54c3cc4",
  ["64778757908501179476331390591326653229579537200061619395979045269181713848562",
   "69222761152567422456550754954182616722608546823277879350969354961713727175064"]),
 ("LoL TES vs WE", False, "0xae0c8a794fe4d0300eca6b39e8bea60ab0f1a2078aa8ca2aac88adc4808a69a6",
  ["95881905429518344941380148326492553933806571454773462059114401886982592434913",
   "5672952468548015184968602470125350481899055121933384423405096851532324921748"]),
 ("Fed no change (negRisk)", True, "0x8bf1c1536ecb1c08fe13c6b71e8ab1f58bf3461c4cb79f5f1679f869a06aef86",
  ["111604417349377875799825956621596386269673370070912696668140891647145772186047",
   "36015050921127306245266044699797268780268172446856063291868548314968920497494"]),
]

for name, nr, cond, expected in cases:
    yes = get_position_id(get_collection_id(cond, 1))   # indexSet 1 = outcome 0 = YES
    no  = get_position_id(get_collection_id(cond, 2))   # indexSet 2 = outcome 1 = NO
    my  = [str(yes), str(no)]
    print(f"{name}  (negRisk={nr})")
    print(f"  YES computed={yes}")
    print(f"      expected={expected[0]}  MATCH={str(yes)==expected[0]}")
    print(f"  NO  computed={no}")
    print(f"      expected={expected[1]}  MATCH={str(no)==expected[1]}")
    print()
