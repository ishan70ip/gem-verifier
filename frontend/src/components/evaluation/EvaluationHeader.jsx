import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export default function EvaluationHeader({ evaluation, onComplete }) {
  const awarded = evaluation.status === "CONTRACT_AWARDED" || evaluation.status === "AWARDED";
  const completed = awarded || evaluation.status === "EVALUATION_COMPLETED" || evaluation.status === "COMPLETED" || evaluation.completed;
  return <section className="evaluation-header-new"><div><Link to="/tenders" className="evaluation-back"><ArrowLeft size={15} /> Evaluations</Link><div className="section-kicker">TENDER EVALUATION</div><h1>{evaluation.title}</h1><div className="evaluation-meta-new"><b>{evaluation.tenderReference}</b><span>{evaluation.department}</span><span>Deadline: {evaluation.deadline}</span><span>ID: {evaluation.id}</span></div></div><div className="evaluation-header-actions"><span className="completed-status">{awarded ? "✓ Contract awarded" : completed ? "✓ Evaluation completed" : "Evaluation in progress"}</span>{completed && !awarded ? <Link to={`/awards/${evaluation.id}`} className="btn btn-primary"><CheckCircle2 size={14} /> Assign contract</Link> : null}{!completed && onComplete ? <button className="btn btn-primary" onClick={onComplete}><CheckCircle2 size={14} /> Complete evaluation</button> : null}</div></section>;
}
