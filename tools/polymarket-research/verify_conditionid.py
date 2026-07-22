import json, gzip
from Crypto.Hash import keccak

def k256(b):
    h = keccak.new(digest_bits=256); h.update(b); return h.digest()

def cond_id(oracle_hex, question_id_hex, slots=2):
    packed = bytes.fromhex(oracle_hex[2:]) + bytes.fromhex(question_id_hex[2:]) + slots.to_bytes(32, "big")
    return "0x" + k256(packed).hex()

mk = json.load(gzip.open("data/markets.json.gz", "rt"))
res = {True: [0, 0], False: [0, 0]}   # negRisk -> [match, total]
for m in mk:
    o, q, c = m.get("resolvedBy"), m.get("questionID"), m.get("conditionId")
    if not (o and q and c):
        continue
    nr = bool(m.get("negRisk"))
    got = cond_id(o, q, 2).lower() == c.lower()
    res[nr][0] += int(got); res[nr][1] += 1

for nr in (False, True):
    mt, tot = res[nr]
    pct = 100 * mt / tot if tot else 0
    print(f"negRisk={str(nr):5}  matches={mt:4}/{tot:<4}  ({pct:.1f}%)")
print()
print("Conclusion:")
print("  Standard CTF markets: conditionId == keccak256(resolvedBy ‖ questionID ‖ uint256(2))")
print("  Neg-risk markets:     conditionId prepared by NegRiskAdapter (different oracle/questionId) -> formula does not apply")
