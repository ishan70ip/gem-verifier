import { useEffect, useState } from "react";
import { AlertTriangle, Download, X } from "lucide-react";
import { fetchDocumentBlob } from "@/services/evaluationService";

export default function DocumentPreviewModal({ doc, onClose }) {
    const [state, setState] = useState({ status: "idle", url: "", mimeType: "", message: "" });

    useEffect(() => {
        if (!doc) return undefined;
        let cancelled = false;
        let objectUrl = "";
        setState({ status: "loading", url: "", mimeType: "", message: "" });
        fetchDocumentBlob(doc.id)
            .then(blob => {
                if (cancelled) return;
                objectUrl = window.URL.createObjectURL(blob);
                setState({ status: "ready", url: objectUrl, mimeType: blob.type, message: "" });
            })
            .catch(err => {
                if (!cancelled) setState({ status: "error", url: "", mimeType: "", message: err.message || "Could not load this document." });
            });
        return () => {
            cancelled = true;
            if (objectUrl) window.URL.revokeObjectURL(objectUrl);
        };
    }, [doc]);

    if (!doc) return null;

    const mimeType = state.mimeType || doc.mimeType || "";
    const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(doc.originalFilename || "");
    const isImage = mimeType.startsWith("image/");

    const handleDownload = () => {
        if (!state.url) return;
        const link = window.document.createElement("a");
        link.href = state.url;
        link.download = doc.originalFilename || "document";
        window.document.body.appendChild(link);
        link.click();
        link.remove();
    };

    return (
        <div className="doc-preview-overlay" onClick={onClose}>
            <div className="doc-preview-modal" onClick={event => event.stopPropagation()}>
                <header className="doc-preview-header">
                    <div className="doc-preview-title">
                        <b>{doc.originalFilename || "Document"}</b>
                        <small>{(doc.documentType || "document").replace(/_/g, " ")}</small>
                    </div>
                    <div className="doc-preview-actions">
                        {state.status === "ready" && (
                            <button className="btn btn-ghost" onClick={handleDownload}>
                                <Download size={14} /> Download
                            </button>
                        )}
                        <button className="doc-preview-close" onClick={onClose} aria-label="Close preview">
                            <X size={18} />
                        </button>
                    </div>
                </header>
                <div className="doc-preview-body">
                    {state.status === "loading" && <div className="doc-preview-status">Loading document…</div>}
                    {state.status === "error" && (
                        <div className="doc-preview-status doc-preview-error">
                            <AlertTriangle size={16} /> {state.message}
                        </div>
                    )}
                    {state.status === "ready" && isPdf && <iframe title={doc.originalFilename || "Document preview"} src={state.url} className="doc-preview-frame" />}
                    {state.status === "ready" && !isPdf && isImage && <img src={state.url} alt={doc.originalFilename || "Document preview"} className="doc-preview-image" />}
                    {state.status === "ready" && !isPdf && !isImage && (
                        <div className="doc-preview-status">
                            This file type can't be previewed in the browser.
                            <button className="btn btn-ghost" onClick={handleDownload} style={{ marginLeft: 10 }}>
                                <Download size={14} /> Download instead
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}