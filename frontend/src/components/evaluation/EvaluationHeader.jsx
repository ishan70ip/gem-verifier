import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

export default function EvaluationHeader({ evaluation, onComplete }) {
  const { t } = useLanguage();
  const awarded = evaluation.status === "CONTRACT_AWARDED" || evaluation.status === "AWARDED";
  const completed = awarded || evaluation.status === "EVALUATION_COMPLETED" || evaluation.status === "COMPLETED" || evaluation.completed;
  return <section className="evaluation-header-new"><div><Link to="/tenders" className="evaluation-back"><ArrowLeft size={15} /> {t("evalHeader.back")}</Link><div className="section-kicker">{t("evalHeader.kicker")}</div><h1>{evaluation.title}</h1><div className="evaluation-meta-new"><b>{evaluation.tenderReference}</b><span>{evaluation.department}</span><span>{t("evalHeader.deadlineLabel")} {evaluation.deadline}</span><span>{t("evalHeader.idLabel")} {evaluation.id}</span></div></div><div className="evaluation-header-actions"><span className="completed-status">{awarded ? t("evalHeader.awarded") : completed ? t("evalHeader.completed") : t("evalHeader.inProgress")}</span>{completed && !awarded ? <Link to={`/awards/${evaluation.id}`} className="btn btn-primary"><CheckCircle2 size={14} /> {t("evalHeader.assignContract")}</Link> : null}{!completed && onComplete ? <button className="btn btn-primary" onClick={onComplete}><CheckCircle2 size={14} /> {t("evalHeader.completeEvaluation")}</button> : null}</div></section>;
}
