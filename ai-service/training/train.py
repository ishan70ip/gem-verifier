"""
Fine-tune the evidence reranker (cross-encoder) on the synthetic corpus.
Run on Colab (free GPU): pip install -r ../requirements.txt first.

  python train.py --train train.jsonl --val val.jsonl --out ./models/reranker

Base: cross-encoder/ms-marco-MiniLM-L-6-v2 (English) — swap
MODEL_NAME to a multilingual base (e.g. MoritzLaurer/mDeBERTa-v3-base-mnli)
once Hindi pairs dominate the corpus.
"""
import argparse
import json

def load(path):
    rows = [json.loads(l) for l in open(path) if l.strip()]
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", required=True)
    ap.add_argument("--val", required=True)
    ap.add_argument("--out", default="./models/reranker")
    ap.add_argument("--model", default="cross-encoder/ms-marco-MiniLM-L-6-v2")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=2e-5)
    args = ap.parse_args()

    from sentence_transformers import CrossEncoder
    from sentence_transformers.cross_encoder.evaluation import CEBinaryClassificationEvaluator
    from torch.utils.data import DataLoader

    train_rows = load(args.train)
    val_rows = load(args.val)
    train_pairs = [[r["requirement"], r["chunk"]] for r in train_rows]
    train_labels = [r["label"] for r in train_rows]
    val_pairs = [[r["requirement"], r["chunk"]] for r in val_rows]
    val_labels = [r["label"] for r in val_rows]

    model = CrossEncoder(args.model, num_labels=1)
    loader = DataLoader(list(zip(train_pairs, train_labels)), batch_size=args.batch, shuffle=True)
    evaluator = CEBinaryClassificationEvaluator(val_pairs, val_labels)

    model.fit(
        train_dataloader=loader,
        evaluator=evaluator,
        epochs=args.epochs,
        evaluation_steps=200,
        warmup_steps=max(10, len(loader) // 10),
        lr=args.lr,
        output_path=args.out,
        save_best_model=True,
    )
    print("saved ->", args.out)

if __name__ == "__main__":
    main()
