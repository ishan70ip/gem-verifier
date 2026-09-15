import { Eye, FileText, X } from "lucide-react";

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function VendorDocumentsDrawer({ vendor, documents, onClose, onView }) {
  if (!vendor) return null;
  return (
    <div className="drawer-overlay-new" onClick={onClose}>
      <aside className="evidence-drawer-new" onClick={event => event.stopPropagation()}>
        <header>
          <div>
            <div className="section-kicker">SUBMITTED DOCUMENTS</div>
            <h2>{vendor.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close vendor documents">
            <X size={18} />
          </button>
        </header>

        <div className="drawer-flow-step">
          <label>Bid reference</label>
          <p>{vendor.bid?.bidReference || "No bid submitted"}</p>
        </div>

        <div className="drawer-flow-step">
          <label>Documents ({documents.length})</label>
          {documents.length ? (
            <div className="vendor-doc-list">
              {documents.map(doc => (
                <div className="vendor-doc-row" key={doc.id}>
                  <div className="vendor-doc-info">
                    <b><FileText size={13} /> {doc.originalFilename || "Document"}</b>
                    <small>
                      {(doc.documentType || "document").replace(/_/g, " ")}
                      {formatSize(doc.fileSize) ? ` · ${formatSize(doc.fileSize)}` : ""}
                    </small>
                  </div>
                  <button className="btn btn-ghost" onClick={() => onView(doc)}>
                    <Eye size={13} /> View
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="drawer-missing">
              <FileText size={15} /> This vendor has not submitted any documents yet.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}