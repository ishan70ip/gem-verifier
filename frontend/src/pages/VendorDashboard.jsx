import { useState, useEffect } from "react";
import AppShell from "../components/AppShell";
import StatusBadge from "../components/StatusBadge";
import { apiRequest } from "../services/apiClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
import {
  Building2,
  FileText,
  Send,
  Upload,
  CheckCircle2,
  Clock,
  Award,
  FileCheck,
  Search,
  ShieldCheck,
  Download,
  X,
  Edit3,
  Check,
  ChevronRight,
  Info,
  DollarSign,
  Calendar,
  Layers,
} from "lucide-react";

export default function VendorDashboard() {
  const [profile, setProfile] = useState(null);
  const [tenders, setTenders] = useState([]);
  const [bids, setBids] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [documentsMap, setDocumentsMap] = useState({}); // bidId -> docs[]
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tenders"); // tenders | bids | contracts | profile
  const [searchQuery, setSearchQuery] = useState("");
  const [notification, setNotification] = useState({ type: "", text: "" });

  // Modal / Drawer States
  const [selectedTender, setSelectedTender] = useState(null);
  const [isBiddingModalOpen, setIsBiddingModalOpen] = useState(false);
  const [bidForm, setBidForm] = useState({ price: "", deliveryDays: "30", remarks: "" });

  const [activeUploadBidId, setActiveUploadBidId] = useState(null);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [docCategory, setDocCategory] = useState("Technical Proposal");
  const [isUploading, setIsUploading] = useState(false);

  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ legalName: "", phone: "", category: "MSME", gstin: "" });

  const showNotification = (text, type = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification({ text: "", type: "" }), 5000);
  };

  useEffect(() => {
    loadAllVendorData();
  }, []);

  const loadAllVendorData = async () => {
    try {
      setLoading(true);
      const [profData, tendData, bidsData, contData] = await Promise.allSettled([
        apiRequest("/vendor/profile"),
        apiRequest("/vendor/tenders"),
        apiRequest("/vendor/bids"),
        apiRequest("/vendor/contracts"),
      ]);

      if (profData.status === "fulfilled" && profData.value) {
        setProfile(profData.value);
        setProfileForm({
          legalName: profData.value.legalName || "",
          phone: profData.value.contact?.phone || "",
          category: profData.value.organization?.category || "MSME",
          gstin: profData.value.organization?.gstin || "",
        });
      }
      if (tendData.status === "fulfilled") setTenders(tendData.value || []);

      if (bidsData.status === "fulfilled") {
        const bidList = bidsData.value || [];
        setBids(bidList);
        // Fetch documents for each bid
        bidList.forEach(async (bid) => {
          try {
            const docs = await apiRequest(`/vendor/bids/${bid.id}/documents`);
            setDocumentsMap((prev) => ({ ...prev, [bid.id]: docs || [] }));
          } catch {
            // ignore doc fetch error if empty
          }
        });
      }

      if (contData.status === "fulfilled") setContracts(contData.value || []);
    } catch (err) {
      console.error("Failed loading vendor portal data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTenderDetails = async (tenderId) => {
    try {
      const detailedTender = await apiRequest(`/vendor/tenders/${tenderId}`);
      setSelectedTender(detailedTender);
    } catch (err) {
      showNotification(`Failed loading tender details: ${err.message}`, "error");
    }
  };

  const handleOpenBidWizard = (tender) => {
    setSelectedTender(tender);
    setBidForm({ price: "", deliveryDays: "30", remarks: "" });
    setIsBiddingModalOpen(true);
  };

  const handleConfirmSubmitBid = async (e) => {
    e.preventDefault();
    if (!selectedTender) return;

    try {
      const payload = {
        bid_reference: `BID-${Date.now().toString().slice(-6)}`,
        bid_metadata: {
          quotedPrice: bidForm.price ? parseFloat(bidForm.price) : 0,
          deliveryTimelineDays: Number(bidForm.deliveryDays),
          remarks: bidForm.remarks,
        },
      };

      const newBid = await apiRequest(`/vendor/tenders/${selectedTender.id}/bids`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setBids((prev) => [newBid, ...prev]);
      setIsBiddingModalOpen(false);
      setSelectedTender(null);
      showNotification(`Bid ${newBid.bidReference} submitted successfully! You can now upload technical compliance documents.`, "success");
      setActiveTab("bids");
    } catch (err) {
      showNotification(err.message || "Failed to submit bid", "error");
    }
  };

  const handleUploadDocument = async (e, bidId) => {
    e.preventDefault();
    if (!fileToUpload) {
      showNotification("Please select a file to upload.", "error");
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("document_type", docCategory);

      const token = localStorage.getItem("gem_access_token");
      const res = await fetch(`${API_BASE_URL}/vendor/bids/${bidId}/documents`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "File upload failed");
      }

      const uploadedDoc = await res.json();
      setDocumentsMap((prev) => ({
        ...prev,
        [bidId]: [...(prev[bidId] || []), uploadedDoc],
      }));

      setFileToUpload(null);
      setActiveUploadBidId(null);
      showNotification(`Document "${uploadedDoc.originalFilename}" uploaded and stored successfully!`, "success");
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const updated = await apiRequest("/vendor/profile", {
        method: "PATCH",
        body: JSON.stringify({
          legalName: profileForm.legalName,
          contact: { ...(profile?.contact || {}), phone: profileForm.phone },
          organization: { ...(profile?.organization || {}), category: profileForm.category, gstin: profileForm.gstin },
        }),
      });
      setProfile(updated);
      setIsEditProfileOpen(false);
      showNotification("Vendor organization profile updated successfully!", "success");
    } catch (err) {
      showNotification(err.message || "Failed updating profile", "error");
    }
  };

  // Calculations & Filtering
  const handleDownloadDoc = async (doc) => {
    try {
      const token = localStorage.getItem("gem_access_token");
      const res = await fetch(`${API_BASE_URL}/documents/${doc.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.originalFilename || "document";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showNotification(err.message || "Download failed", "error");
    }
  };  const filteredTenders = tenders.filter(
    (t) =>
      t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.referenceNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalDocsCount = Object.values(documentsMap).reduce((acc, curr) => acc + curr.length, 0);

  return (
    <AppShell>
      {/* Top Banner Message */}
      {notification.text && (
        <div className={`vendor-notification-banner ${notification.type}`}>
          <Info size={18} />
          <span>{notification.text}</span>
          <button onClick={() => setNotification({ text: "", type: "" })} className="close-banner">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Vendor Header Strip */}
      <div className="vendor-header-card">
        <div className="vendor-header-main">
          <div className="vendor-avatar-badge">
            <Building2 size={28} />
          </div>
          <div>
            <div className="vendor-code-tag">{profile?.vendorCode || "VEN-VERIFIED"}</div>
            <h1>{profile?.legalName || "Vendor Organization Portal"}</h1>
            <p className="vendor-sub">
              {profile?.contact?.email || "vendor@acme.com"} • GSTIN: {profile?.organization?.gstin || "07AAAAA0000A1Z5"} • Category:{" "}
              {profile?.organization?.category || "MSME"}
            </p>
          </div>
        </div>

        <button className="btn-edit-profile" onClick={() => setIsEditProfileOpen(true)}>
          <Edit3 size={15} /> Edit Profile
        </button>
      </div>

      {/* Vendor Overview Stats Metrics */}
      <div className="vendor-metrics-grid">
        <div className="metric-box orange">
          <div className="metric-icon"><FileText size={20} /></div>
          <div>
            <div className="metric-num">{tenders.length}</div>
            <div className="metric-lbl">Available Open Tenders</div>
          </div>
        </div>

        <div className="metric-box blue">
          <div className="metric-icon"><Send size={20} /></div>
          <div>
            <div className="metric-num">{bids.length}</div>
            <div className="metric-lbl">Bids Submitted</div>
          </div>
        </div>

        <div className="metric-box green">
          <div className="metric-icon"><Award size={20} /></div>
          <div>
            <div className="metric-num">{contracts.length}</div>
            <div className="metric-lbl">Awarded Contracts</div>
          </div>
        </div>

        <div className="metric-box teal">
          <div className="metric-icon"><FileCheck size={20} /></div>
          <div>
            <div className="metric-num">{totalDocsCount}</div>
            <div className="metric-lbl">Compliance Documents</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="vendor-nav-tabs">
        <button className={activeTab === "tenders" ? "nav-tab-btn active" : "nav-tab-btn"} onClick={() => setActiveTab("tenders")}>
          <FileText size={16} /> Open Tenders ({tenders.length})
        </button>
        <button className={activeTab === "bids" ? "nav-tab-btn active" : "nav-tab-btn"} onClick={() => setActiveTab("bids")}>
          <Send size={16} /> My Submitted Bids ({bids.length})
        </button>
        <button className={activeTab === "contracts" ? "nav-tab-btn active" : "nav-tab-btn"} onClick={() => setActiveTab("contracts")}>
          <Award size={16} /> Awarded Contracts ({contracts.length})
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <div className="vendor-loading">Loading vendor workspace resources...</div>
      ) : (
        <div className="vendor-tab-body">
          {/* TAB 1: AVAILABLE OPEN TENDERS */}
          {activeTab === "tenders" && (
            <div className="vendor-section-card">
              <div className="section-toolbar">
                <div>
                  <h2>Public Government Tenders</h2>
                  <p className="subtext">Browse open procurement requirements and submit compliance bids.</p>
                </div>
                <div className="vendor-search-bar">
                  <Search size={16} />
                  <input
                    placeholder="Search tender reference, department..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {filteredTenders.length === 0 ? (
                <div className="vendor-empty-state">No open tenders match your filter.</div>
              ) : (
                <div className="tenders-grid">
                  {filteredTenders.map((tender) => {
                    const existingBid = bids.find((b) => b.tenderId === tender.id);
                    return (
                      <div key={tender.id} className="tender-card-item">
                        <div className="card-top-row">
                          <span className="ref-number">{tender.referenceNumber || tender.id}</span>
                          <span className="status-badge-open">OPEN FOR BIDDING</span>
                        </div>

                        <h3 className="tender-item-title">{tender.title}</h3>
                        <p className="tender-dept-name">{tender.department}</p>
                        <p className="tender-description">{tender.description}</p>

                        <div className="tender-meta-row">
                          <span>
                            <Clock size={14} /> Deadline:{" "}
                            {tender.submissionDeadline ? new Date(tender.submissionDeadline).toLocaleDateString() : "N/A"}
                          </span>
                        </div>

                        <div className="card-action-bar">
                          <button className="btn-view-details" onClick={() => handleOpenTenderDetails(tender.id)}>
                            Inspect Requirements
                          </button>

                          {existingBid ? (
                            <span className="bid-submitted-pill">
                              <CheckCircle2 size={15} /> Bid Submitted ({existingBid.bidReference})
                            </span>
                          ) : (
                            <button className="btn-submit-bid-action" onClick={() => handleOpenBidWizard(tender)}>
                              <Send size={14} /> Submit Bid
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MY SUBMITTED BIDS */}
          {activeTab === "bids" && (
            <div className="vendor-section-card">
              <div className="section-toolbar">
                <div>
                  <h2>Your Submitted Bids &amp; Document Management</h2>
                  <p className="subtext">Manage submitted bids and upload required technical &amp; commercial evidence.</p>
                </div>
              </div>

              {bids.length === 0 ? (
                <div className="vendor-empty-state">You have not submitted any bids yet.</div>
              ) : (
                <div className="bids-workspace-list">
                  {bids.map((bid) => {
                    const tenderInfo = tenders.find((t) => t.id === bid.tenderId);
                    const bidDocs = documentsMap[bid.id] || [];

                    return (
                      <div key={bid.id} className="bid-workspace-card">
                        <div className="bid-card-header">
                          <div className="bid-header-left">
                            <span className="bid-ref-tag">{bid.bidReference}</span>
                            <span className="status-chip-submitted">{bid.submissionStatus}</span>
                          </div>
                          <span className="bid-date-tag">
                            Submitted on: {new Date(bid.submittedAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="bid-card-body">
                          <h4>Tender: {tenderInfo?.title || `Tender Ref: ${bid.tenderId}`}</h4>
                          <p className="bid-dept">{tenderInfo?.department || "Department of Procurement"}</p>

                          {bid.bidMetadata?.quotedPrice > 0 && (
                            <div className="bid-quote-strip">
                              <span>Quoted Price: <strong>₹ {bid.bidMetadata.quotedPrice.toLocaleString("en-IN")}</strong></span>
                              <span>Delivery Timeline: <strong>{bid.bidMetadata.deliveryTimelineDays || 30} Days</strong></span>
                            </div>
                          )}

                          {/* Uploaded Documents List */}
                          <div className="bid-docs-section">
                            <h5>
                              <FileCheck size={16} /> Submitted Documents ({bidDocs.length})
                            </h5>

                            {bidDocs.length === 0 ? (
                              <p className="no-docs-text">No documents uploaded yet. Upload technical specification, ISO certificates, or warranty letters below.</p>
                            ) : (
                              <div className="docs-flex-list">
                                {bidDocs.map((doc) => (
                                  <div key={doc.id} className="doc-item-pill">
                                    <div className="doc-info font-bold">
                                      <span>{doc.originalFilename}</span>
                                      <small>{doc.documentType} • {(doc.fileSize / 1024).toFixed(1)} KB</small>
                                    </div>
                                    <button
                                      onClick={() => handleDownloadDoc(doc)}
                                      className="btn-download-doc"
                                      title="Download file"
                                    >
                                      <Download size={13} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Inline File Upload Form */}
                          <div className="bid-upload-area">
                            {activeUploadBidId === bid.id ? (
                              <form onSubmit={(e) => handleUploadDocument(e, bid.id)} className="upload-form-expanded">
                                <div className="form-row">
                                  <label>Document Category</label>
                                  <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}>
                                    <option value="Technical Proposal">Technical Proposal</option>
                                    <option value="ISO 9001 Certificate">ISO 9001 Certificate</option>
                                    <option value="OEM Warranty Letter">OEM Warranty Letter</option>
                                    <option value="Past Contract Experience">Past Contract Experience</option>
                                    <option value="Commercial Bid Financial Quote">Commercial Bid Financial Quote</option>
                                  </select>
                                </div>

                                <div className="form-row">
                                  <label>Select Document File (PDF, DOCX, PNG)</label>
                                  <input
                                    type="file"
                                    required
                                    onChange={(e) => setFileToUpload(e.target.files[0])}
                                  />
                                </div>

                                <div className="form-btn-group">
                                  <button type="submit" disabled={isUploading} className="btn-upload-submit">
                                    {isUploading ? "Uploading..." : "Upload Document"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-upload-cancel"
                                    onClick={() => {
                                      setActiveUploadBidId(null);
                                      setFileToUpload(null);
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <button className="btn-trigger-upload" onClick={() => setActiveUploadBidId(bid.id)}>
                                <Upload size={14} /> Upload New Bid Document
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AWARDED CONTRACTS */}
          {activeTab === "contracts" && (
            <div className="vendor-section-card">
              <div className="section-toolbar">
                <div>
                  <h2>Official Awarded Contracts</h2>
                  <p className="subtext">Contracts awarded to your organization by procurement evaluation officers.</p>
                </div>
              </div>

              {contracts.length === 0 ? (
                <div className="vendor-empty-state">No contracts awarded yet.</div>
              ) : (
                <div className="contracts-grid">
                  {contracts.map((contract) => (
                    <div key={contract.id} className="vendor-contract-card">
                      <div className="contract-card-header">
                        <span className="contract-ref-badge">{contract.contractReference}</span>
                        <span className="award-active-badge">ACTIVE CONTRACT</span>
                      </div>
                      <h3>Contract Awarded</h3>
                      <p className="award-date">
                        Award Date: {new Date(contract.awardedAt).toLocaleDateString()}
                      </p>
                      <div className="contract-actions">
                        <span className="award-eligible-tag">
                          <CheckCircle2 size={15} /> Fully Compliant &amp; Assigned
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: INSPECT TENDER REQUIREMENTS */}
      {selectedTender && !isBiddingModalOpen && (
        <div className="modal-overlay" onClick={() => setSelectedTender(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-ref-tag">{selectedTender.referenceNumber || selectedTender.id}</span>
                <h2>{selectedTender.title || selectedTender.name}</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedTender(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-dept">Department: {selectedTender.department}</p>
              <p className="modal-desc">{selectedTender.description}</p>

              <h4 className="reqs-title">Mandatory Tender Compliance Requirements</h4>
              {selectedTender.requirements && selectedTender.requirements.length > 0 ? (
                <div className="reqs-list">
                  {selectedTender.requirements.map((req) => (
                    <div key={req.id || req._id} className="req-item-box">
                      <div className="req-header">
                        <strong>{req.title}</strong>
                        <span className="req-cat-badge">{req.category}</span>
                      </div>
                      <p>{req.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-reqs-text">Requirements checklist items are being extracted by central procurement.</p>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary-modal" onClick={() => setSelectedTender(null)}>
                Close
              </button>
              {!bids.some((b) => b.tenderId === selectedTender.id) && (
                <button
                  className="btn-primary-modal"
                  onClick={() => {
                    handleOpenBidWizard(selectedTender);
                  }}
                >
                  Prepare &amp; Submit Bid
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: PREPARE & SUBMIT BID WIZARD */}
      {isBiddingModalOpen && selectedTender && (
        <div className="modal-overlay" onClick={() => setIsBiddingModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-ref-tag">BID PREPARATION WIZARD</span>
                <h2>Submit Bid for {selectedTender.referenceNumber}</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setIsBiddingModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmSubmitBid}>
              <div className="modal-body">
                <div className="tender-summary-callout">
                  <strong>{selectedTender.title}</strong>
                  <p>{selectedTender.department}</p>
                </div>

                <div className="form-group-modal">
                  <label htmlFor="price">Quoted Commercial Price (INR ₹)</label>
                  <input
                    id="price"
                    type="number"
                    required
                    placeholder="e.g. 4500000"
                    value={bidForm.price}
                    onChange={(e) => setBidForm({ ...bidForm, price: e.target.value })}
                  />
                </div>

                <div className="form-group-modal">
                  <label htmlFor="timeline">Execution &amp; Delivery Timeline (Days)</label>
                  <input
                    id="timeline"
                    type="number"
                    required
                    placeholder="30"
                    value={bidForm.deliveryDays}
                    onChange={(e) => setBidForm({ ...bidForm, deliveryDays: e.target.value })}
                  />
                </div>

                <div className="form-group-modal">
                  <label htmlFor="remarks">Technical Remarks / Offer Notes</label>
                  <textarea
                    id="remarks"
                    rows={3}
                    placeholder="Provide additional details regarding OEM authorization, ISO compliance, etc."
                    value={bidForm.remarks}
                    onChange={(e) => setBidForm({ ...bidForm, remarks: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary-modal" onClick={() => setIsBiddingModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-modal">
                  <Send size={15} /> Confirm &amp; Submit Official Bid
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT PROFILE FORM */}
      {isEditProfileOpen && (
        <div className="modal-overlay" onClick={() => setIsEditProfileOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Vendor Organization Profile</h2>
              <button className="modal-close-btn" onClick={() => setIsEditProfileOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div className="modal-body">
                <div className="form-group-modal">
                  <label>Legal Company Name</label>
                  <input
                    type="text"
                    required
                    value={profileForm.legalName}
                    onChange={(e) => setProfileForm({ ...profileForm, legalName: e.target.value })}
                  />
                </div>

                <div className="form-group-modal">
                  <label>Official Contact Phone</label>
                  <input
                    type="text"
                    required
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  />
                </div>

                <div className="form-group-modal">
                  <label>Business Category</label>
                  <select
                    value={profileForm.category}
                    onChange={(e) => setProfileForm({ ...profileForm, category: e.target.value })}
                  >
                    <option value="MSME">MSME Micro / Small</option>
                    <option value="Startup">DPIIT Registered Startup</option>
                    <option value="Enterprise">Enterprise Bidder</option>
                  </select>
                </div>

                <div className="form-group-modal">
                  <label>GSTIN Number</label>
                  <input
                    type="text"
                    required
                    value={profileForm.gstin}
                    onChange={(e) => setProfileForm({ ...profileForm, gstin: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary-modal" onClick={() => setIsEditProfileOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-modal">
                  <Check size={15} /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
