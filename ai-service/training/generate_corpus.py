"""
Synthetic corpus generator for the evidence-finder reranker.
Produces JSONL rows: {"requirement": ..., "chunk": ..., "label": 0/1}

Strategy:
  - requirement templates x compliant / non_compliant / irrelevant chunks
  - hard negatives: near-miss numbers, wrong-topic money, negations/exemptions
  - EN + HI variants (hand templates; scale with one Gemini paraphrase pass)
Run: python generate_corpus.py --out train.jsonl --n 5000 --seed 7
"""
import argparse
import json
import random

TURNOVER_VALS = [("40 Lakh", 4_000_000), ("80 Lakh", 8_000_000), ("1.2 Crore", 12_000_000),
                 ("4.5 Crore", 45_000_000), ("Rs 10000000", 10_000_000), ("Rs 5000000", 5_000_000)]
EMD_VALS = [("Rs 100000", 100_000), ("Rs 200000", 200_000), ("Rs 500000", 500_000), ("Rs 1000000", 1_000_000)]
EXP_VALS = [("2 years", 2), ("3 years", 3), ("5 years", 5), ("12 years", 12)]
WAR_VALS = [("1 year", 1), ("3 years", 3), ("5 years", 5)]

# (requirement template, value pool, threshold INR/years, probe hint, chunk variants)
REQUIREMENTS = [
    ("Minimum average annual turnover: Rs {t} over last 3 years.", TURNOVER_VALS, 10_000_000,
     ["Average annual turnover of Rs {v} for last 3 financial years.",
      "pichhle 3 salon ka ausat turnover Rs {v} raha.",
      "Mean yearly revenue of Rs {v} across three fiscals."]),
    ("Minimum EMD required: Rs {t}.", EMD_VALS, 500_000,
     ["EMD of Rs {v} enclosed vide demand draft.",
      "Bayana rashi Rs {v} sanlagn hai.",
      "Bid security amounting to Rs {v} submitted."]),
    ("Minimum {t} of experience in relevant supplies.", EXP_VALS, 5,
     ["{v} of experience executing government supply projects.",
      "sarkari aapurti pariyojanaon mein {v} ka anubhav."]),
    ("Minimum {t} comprehensive on-site warranty.", WAR_VALS, 3,
     ["{v} comprehensive on-site warranty offered.",
      "{v} ki vyaapak on-site warranty pradaan ki jaati hai."]),
    ("Vendor must possess valid ISO 9001 certificate.", None, None,
     ["ISO 9001:2015 certified. Certificate valid till 2027.",
      "ISO 9001:2015 pramaanit. 2027 tak vaidh."]),
    ("Valid OEM authorisation / MAF required.", None, None,
     ["OEM Authorization from the manufacturer attached (MAF dated 2026).",
      "Nirmaata dwara OEM pradhikaran sanlagn hai."]),
]

IRRELEVANT = [
    "We offer best prices assured with timely delivery schedules.",
    "The company was incorporated under the Companies Act with registered office in Delhi.",
    "All pages of this bid are duly signed and stamped by the authorized signatory.",
    "Hamari company samay par delivery ki guarantee deti hai.",
]
NEGATIONS = [
    "EMD exempted for MSE bidders as per GeM terms.",
    "ISO 9001 applied for; certificate awaited.",
    "Turnover figures are provisional and unaudited.",
]


def gen(rng, n):
    rows = []
    for _ in range(n):
        entry = rng.choice(REQUIREMENTS)
        req_tpl, pool, threshold, variants = entry
        if pool is None:
            # boolean requirements (ISO / OEM): positive = claim present,
            # negative = negation or irrelevant
            req = req_tpl
            kind = rng.random()
            if kind < 0.5:
                rows.append({"requirement": req, "chunk": rng.choice(variants), "label": 1})
            elif kind < 0.75:
                rows.append({"requirement": req, "chunk": rng.choice(NEGATIONS), "label": 0})
            else:
                rows.append({"requirement": req, "chunk": rng.choice(IRRELEVANT), "label": 0})
            continue
        t_disp, t_val = rng.choice(pool)
        req = req_tpl.format(t=t_disp)
        kind = rng.random()
        if kind < 0.40:
            # positive: value MEETS the threshold
            cands = [p for p in pool if p[1] >= threshold] or pool
            v_disp, _ = rng.choice(cands)
            rows.append({"requirement": req, "chunk": rng.choice(variants).format(v=v_disp), "label": 1})
        elif kind < 0.65:
            # hard negative: near-miss value BELOW the threshold
            cands = [p for p in pool if p[1] < threshold] or pool
            v_disp, _ = rng.choice(cands)
            rows.append({"requirement": req, "chunk": rng.choice(variants).format(v=v_disp), "label": 0})
        elif kind < 0.80:
            # hard negative: negation / exemption
            rows.append({"requirement": req, "chunk": rng.choice(NEGATIONS), "label": 0})
        else:
            # easy negative: irrelevant
            rows.append({"requirement": req, "chunk": rng.choice(IRRELEVANT), "label": 0})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="train.jsonl")
    ap.add_argument("--n", type=int, default=5000)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    rows = gen(rng, args.n)
    pos = sum(r["label"] for r in rows)
    with open(args.out, "w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"wrote {len(rows)} rows ({pos} positive) -> {args.out}")


if __name__ == "__main__":
    main()
