import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

// Sahayak — fully static assistant widget (no backend, no tokens).
// Rule-based Q&A over platform knowledge so the demo story ("agentic help")
// works offline and costs nothing. Mounted once in AppShell.
const FALLBACKS = [
  "I can help with scores, eligibility, uploads, rejections, and how verification works. Try a quick question below!",
];

const INTENTS = [
  {
    keys: ["score", "scoring", " marks", "percent", "94", "100", "23", "calculate"],
    reply:
      "Compliance score is a weighted average: each check carries a weight (debarment 14, GST/Udyam 12, PAN/turnover 10…). Compliant earns full weight, needs-review earns 40%, fail earns 0. Acme hit 100, Brightline 97 (one open item), Shady 23.",
  },
  {
    keys: ["eligible", "eligibility", "qualify", "conditional"],
    reply:
      "A vendor is ELIGIBLE only with zero mandatory fails, zero open reviews, no debarment, and score 80+. Brightline at 97% is still CONDITIONAL — one open review vetoes eligibility until an officer resolves it.",
  },
  {
    keys: ["reject", "rejection", "rejected", "why", "reason", "disqualif"],
    reply:
      "Open any matrix cell to see the exact evidence quote, source certificate, and the officer's stated reason. Vendors see the same reasons in their portal after the evaluation is final — nothing is a black box.",
  },
  {
    keys: ["upload", "submit", "document", "bid ", "how to", "how do"],
    reply:
      "Vendors: open a tender → Inspect Requirements → Submit Bid → upload PDFs, or paste a GeM seller bid ID (try GEM-BID-2026-104) to import documents instantly.",
  },
  {
    keys: ["gem id", "gem-bid", "import"],
    reply:
      "In the vendor tender view, click Browse GeM bids and import any listed ID — e.g. GEM-BID-2026-104 pulls a financial statement, EMD receipt and experience letter straight onto the bid.",
  },
  {
    keys: ["hindi", "language", "toggle", "हिंदी"],
    reply: "Click the अ / English toggle in the header — all 460+ UI strings switch instantly, including this panel's buttons.",
  },
  {
    keys: ["award", "approve", "contract", "l1", "winner"],
    reply:
      "After resolving every review, the officer completes the evaluation, then approves one or more vendors — each approval creates its own record. Approved vendors appear in vendor Contracts tabs; rejected ones land in Rejected with reasons.",
  },
  {
    keys: ["ai", "gemini", "model", "machine", "artificial", "heuristic"],
    reply:
      "Deterministic rules decide pass/fail on exact checks; Gemini adjudicates only ambiguous items and can never overturn a rule. Every AI call stores its prompt, reasoning and quote on the result row for audit.",
  },
  {
    keys: ["portal", "udyam", "gst", "pan", "epfo", "verif"],
    reply:
      "Each identifier extracted from bid PDFs is cross-checked against registry snapshots (Udyam, GSTN, PAN/ITR, EPFO, Startup, debarment). Verified → compliant; mismatch → non-compliant; not found → human review.",
  },
  {
    keys: ["risk", "critical", "medium", "low", "high"],
    reply:
      "Risk is rule-based: debarred → CRITICAL, any mandatory fail → HIGH, open reviews or score under 80 → MEDIUM, else LOW. Shady is CRITICAL (debarred); Acme is LOW (100, all pass).",
  },
  {
    keys: ["confidence", "85", "35", "percent", "%"],
    reply:
      "Confidence reflects evidence quality: 0.95 portal-verified, 0.85+ extracted proof with margin, 0.60 hints, 0.35 nothing found. It tells the officer where to look first — never a grade on the vendor.",
  },
  {
    keys: ["hello", "hi", "hey", "namaste", "namaskar", "start"],
    reply: "Namaste! I'm Sahayak, your bid assistant. Ask me about scores, eligibility, uploads, rejections — or tap a suggestion below.",
  },
  {
    keys: ["thank", "shukriya", "dhanyavad", "great", "nice", "good"],
    reply: "Anytime! Anything else — scores, documents, approvals?",
  },
  {
    keys: ["who are you", "your name", "sahayak"],
    reply:
      "I'm Sahayak, the demo assistant for this portal. I answer from a built-in knowledge base about verification, scores, uploads and approvals — try the suggestions!",
  },
];

const QUICK = ["How is the score calculated?", "Why was Shady rejected?", "How do I upload documents?", "What does Gemini do here?"];

function answerFor(text) {
  const lower = ` ${text.toLowerCase()} `;
  for (const intent of INTENTS) {
    if (intent.keys.some((k) => lower.includes(k))) return intent.reply;
  }
  return FALLBACKS[0];
}

export default function ChatBot() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Namaste! I'm Sahayak. Ask about scores, eligibility, uploads or approvals." },
  ]);
  const bodyRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, typing, open]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const send = (text) => {
    const clean = text.trim();
    if (!clean || typing) return;
    setMessages((m) => [...m, { from: "user", text: clean }]);
    setInput("");
    setTyping(true);
    timerRef.current = setTimeout(() => {
      setMessages((m) => [...m, { from: "bot", text: answerFor(clean) }]);
      setTyping(false);
    }, 700);
  };

  return (
    <>
      <button
        className="sahayak-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? t("bot.close") : t("bot.open")}
        title="Sahayak"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && <span className="sahayak-dot" />}
      </button>
      {open && (
        <div className="sahayak-panel" role="dialog" aria-label="Sahayak">
          <div className="sahayak-header">
            <span className="sahayak-avatar"><Sparkles size={16} /></span>
            <div>
              <b>Sahayak</b>
              <small><i className="live-dot" /> {t("bot.online")}</small>
            </div>
            <button onClick={() => setOpen(false)} aria-label={t("bot.close")} className="modal-close-btn">
              <X size={16} />
            </button>
          </div>
          <div className="sahayak-body" ref={bodyRef}>
            {messages.map((m, i) => (
              <div key={i} className={`sahayak-msg ${m.from}`}>
                {m.text}
              </div>
            ))}
            {typing && <div className="sahayak-msg bot sahayak-typing"><span /><span /><span /></div>}
          </div>
          <div className="sahayak-quick">
            {QUICK.map((q) => (
              <button key={q} onClick={() => send(q)}>{q}</button>
            ))}
          </div>
          <form
            className="sahayak-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("bot.placeholder")}
            />
            <button type="submit" aria-label={t("bot.send")}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
