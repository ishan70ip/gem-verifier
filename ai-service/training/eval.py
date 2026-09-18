"""
Evaluate a trained reranker: held-out precision@1 + the golden set.
The golden set uses the REAL seeded vendors — the model must retrieve
correctly for Acme, find nothing for Brightline's OEM gap, and fail Shady.

  python eval.py --model ./models/reranker --heldout val.jsonl --golden golden.json
Exit code 0 only if golden accuracy is 100% (demo bar).
"""
import argparse
import json
import sys

def load_jsonl(path):
    return [json.loads(l) for l in open(path) if l.strip()]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--heldout", required=True)
    ap.add_argument("--golden", default="golden.json")
    ap.add_argument("--threshold", type=float, default=0.5)
    args = ap.parse_args()

    from sentence_transformers import CrossEncoder
    model = CrossEncoder(args.model)

    held = load_jsonl(args.heldout)
    pairs = [[r["requirement"], r["chunk"]] for r in held]
    scores = model.predict(pairs).tolist()
    preds = [1 if s >= args.threshold else 0 for s in scores]
    acc = sum(p == r["label"] for p, r in zip(preds, held)) / max(len(held), 1)
    print(f"held-out accuracy: {acc:.3f} (n={len(held)}, threshold={args.threshold})")

    golden = json.load(open(args.golden))
    fails = 0
    for case in golden:
        req = case["requirement"]
        scored = sorted(
            ((model.predict([[req, c]])[0], c) for c in case["chunks"]),
            reverse=True,
        )
        best_score, best_chunk = float(scored[0][0]), scored[0][1]
        want = case["expected"]
        ok = (want == "found" and best_score >= args.threshold and case["must_contain"] in best_chunk) or \
             (want == "absent" and best_score < args.threshold)
        print(("PASS" if ok else "FAIL"), f"[{case['id']}] best={best_score:.3f} want={want}")
        if not ok:
            fails += 1
            print("     got:", best_chunk[:120])
    print(f"golden: {len(golden) - fails}/{len(golden)}")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
