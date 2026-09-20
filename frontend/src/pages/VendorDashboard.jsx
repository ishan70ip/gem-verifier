import { useState, useEffect } from "react";
import AppShell from "../components/AppShell";
import StatusBadge from "../components/StatusBadge";
import { apiRequest } from "../services/apiClient";
import { useLanguage } from "../context/LanguageContext";

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
  const { t } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [tenders, setTenders] = useState([]);
  const [bids, setBids] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [documentsMap, setDocumentsMap] = useState({}); // bidId -> docs[]
  const [feedbackMap, setFeedbackMap] = useState({}); // bidId -> { available, items[] }
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
  const [gemBidId, setGemBidId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [gemPanelOpen, setGemPanelOpen] = useState(false);
  const [gemBids, setGemBids] = useState([]);
  const [gemLoading, setGemLoading] = useState(false);

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
        // Fetch documents + officer feedback for each bid
        bidList.forEach(async (bid) => {
          try {
            const docs = await apiRequest(`/vendor/bids/${bid.id}/documents`);
            setDocumentsMap((prev) => ({ ...prev, [bid.id]: docs || [] }));
          } catch {
            // ignore doc fetch error if empty
          }
          try {
            const fb = await apiRequest(`/vendor/bids/${bid.id}/feedback`);
            setFeedbackMap((prev) => ({ ...prev, [bid.id]: fb || { available: false, items: [] } }));
          } catch {
            // feedback unavailable yet
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
      showNotification(`${t("vendor.failedLoadingTenderDetails")}: ${err.message}`, "error");
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
      showNotification(`${t("vendor.bidSubmittedPrefix")} ${newBid.bidReference} ${t("vendor.bidSubmittedSuffix")}`, "success");
      setActiveTab("bids");
    } catch (err) {
      showNotification(err.message || t("vendor.failedSubmitBid"), "error");
    }
  };

  const handleUploadDocument = async (e, bidId) => {
    e.preventDefault();
    if (!fileToUpload) {
      showNotification(t("vendor.selectFileError"), "error");
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
        throw new Error(errJson.detail || t("vendor.fileUploadFailed"));
      }

      const uploadedDoc = await res.json();
      setDocumentsMap((prev) => ({
        ...prev,
        [bidId]: [...(prev[bidId] || []), uploadedDoc],
      }));

      setFileToUpload(null);
      setActiveUploadBidId(null);
      showNotification(`${t("vendor.docUploadedPrefix")} "${uploadedDoc.originalFilename}" ${t("vendor.docUploadedSuffix")}`, "success");
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
      showNotification(t("vendor.profileUpdated"), "success");
    } catch (err) {
      showNotification(err.message || t("vendor.failedUpdatingProfile"), "error");
    }
  };

  const handleImportGem = async (bidId, gemId) => {
    const chosen = (gemId || gemBidId || "").trim();
    if (!chosen) {
      showNotification(t("vendor.gemIdRequired"), "error");
      return;
    }
    try {
      setIsImporting(true);
      const res = await apiRequest(`/vendor/bids/${bidId}/import-gem`, {
        method: "POST",
        body: JSON.stringify({ gem_bid_id: chosen }),
      });
      const imported = res.imported || [];
      setDocumentsMap((prev) => ({
        ...prev,
        [bidId]: [...(prev[bidId] || []), ...imported],
      }));
      setGemBidId("");
      if (imported.length === 0) {
        showNotification(t("vendor.gemAlreadyImported"), "success");
      } else {
        showNotification(t("vendor.gemImportSuccess").replace("{n}", imported.length), "success");
      }
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleGemPanel = async () => {
    const next = !gemPanelOpen;
    setGemPanelOpen(next);
    if (next && gemBids.length === 0 && !gemLoading) {
      try {
        setGemLoading(true);
        const res = await apiRequest("/vendor/gem-bids/demo-ids");
        setGemBids(res.bids || (res.demo_ids || []).map((id) => ({ id })));
      } catch {
        setGemBids([]);
      } finally {
        setGemLoading(false);
      }
    }
  };

  // Calculations & Filtering
  const handleDownloadDoc = async (doc) => {
    try {
      const token = localStorage.getItem("gem_access_token");
      const res = await fetch(`${API_BASE_URL}/documents/${doc.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(t("vendor.downloadFailed"));
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
      showNotification(err.message || t("vendor.downloadFailed"), "error");
    }
  };  const filteredTenders = tenders.filter(
    (tender) =>
      tender.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tender.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tender.referenceNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalDocsCount = Object.values(documentsMap).reduce((acc, curr) => acc + curr.length, 0);

  // Bid (if any) the vendor already submitted for the tender open in Modal 1.
  // Its documents can be managed inline: direct upload + GeM import.
  const modalBid = selectedTender && !isBiddingModalOpen
    ? bids.find((b) => b.tenderId === selectedTender.id)
    : null;
  const modalBidDocs = modalBid ? documentsMap[modalBid.id] || [] : [];

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
            <h1>{profile?.legalName || t("vendor.orgPortalFallback")}</h1>
            <p className="vendor-sub">
              {profile?.contact?.email || "vendor@acme.com"} • {t("vendor.gstinLabel")} {profile?.organization?.gstin || "07AAAAA0000A1Z5"} • {t("vendor.categoryLabel")}{" "}
              {profile?.organization?.category || "MSME"}
            </p>
          </div>
        </div>

        <button className="btn-edit-profile" onClick={() => setIsEditProfileOpen(true)}>
          <Edit3 size={15} /> {t("vendor.editProfile")}
        </button>
      </div>

      {/* Vendor Overview Stats Metrics */}
      <div className="vendor-metrics-grid">
        <div className="metric-box orange">
          <div className="metric-icon"><FileText size={20} /></div>
          <div>
            <div className="metric-num">{tenders.length}</div>
            <div className="metric-lbl">{t("vendor.availableOpenTenders")}</div>
          </div>
        </div>

        <div className="metric-box blue">
          <div className="metric-icon"><Send size={20} /></div>
          <div>
            <div className="metric-num">{bids.length}</div>
            <div className="metric-lbl">{t("vendor.bidsSubmittedMetric")}</div>
          </div>
        </div>

        <div className="metric-box green">
          <div className="metric-icon"><Award size={20} /></div>
          <div>
            <div className="metric-num">{contracts.length}</div>
            <div className="metric-lbl">{t("vendor.awardedContracts")}</div>
          </div>
        </div>

        <div className="metric-box teal">
          <div className="metric-icon"><FileCheck size={20} /></div>
          <div>
            <div className="metric-num">{totalDocsCount}</div>
            <div className="metric-lbl">{t("vendor.complianceDocuments")}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="vendor-nav-tabs">
        <button className={activeTab === "tenders" ? "nav-tab-btn active" : "nav-tab-btn"} onClick={() => setActiveTab("tenders")}>
          <FileText size={16} /> {t("vendor.openTenders")} ({tenders.length})
        </button>
        <button className={activeTab === "bids" ? "nav-tab-btn active" : "nav-tab-btn"} onClick={() => setActiveTab("bids")}>
          <Send size={16} /> {t("vendor.mySubmittedBids")} ({bids.length})
        </button>
        <button className={activeTab === "contracts" ? "nav-tab-btn active" : "nav-tab-btn"} onClick={() => setActiveTab("contracts")}>
          <Award size={16} /> {t("vendor.awardedContracts")} ({contracts.length})
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <div className="vendor-loading">{t("vendor.loading")}</div>
      ) : (
        <div className="vendor-tab-body">
          {/* TAB 1: AVAILABLE OPEN TENDERS */}
          {activeTab === "tenders" && (
            <div className="vendor-section-card">
              <div className="section-toolbar">
                <div>
                  <h2>{t("vendor.publicTendersTitle")}</h2>
                  <p className="subtext">{t("vendor.publicTendersSubtitle")}</p>
                </div>
                <div className="vendor-search-bar">
                  <Search size={16} />
                  <input
                    placeholder={t("vendor.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {filteredTenders.length === 0 ? (
                <div className="vendor-empty-state">{t("vendor.noTendersEmpty")}</div>
              ) : (
                <div className="tenders-grid">
                  {filteredTenders.map((tender) => {
                    const existingBid = bids.find((b) => b.tenderId === tender.id);
                    return (
                      <div key={tender.id} className="tender-card-item">
                        <div className="card-top-row">
                          <span className="ref-number">{tender.referenceNumber || tender.id}</span>
                          <span className="status-badge-open">{t("vendor.openForBidding")}</span>
                        </div>

                        <h3 className="tender-item-title">{tender.title}</h3>
                        <p className="tender-dept-name">{tender.department}</p>
                        <p className="tender-description">{tender.description}</p>

                        <div className="tender-meta-row">
                          <span>
                            <Clock size={14} /> {t("vendor.deadlineLabel")}{" "}
                            {tender.submissionDeadline ? new Date(tender.submissionDeadline).toLocaleDateString() : t("vendor.notAvailable")}
                          </span>
                        </div>

                        <div className="card-action-bar">
                          <button className="btn-view-details" onClick={() => handleOpenTenderDetails(tender.id)}>
                            {t("vendor.inspectRequirements")}
                          </button>

                          {existingBid ? (
                            <span className="bid-submitted-pill">
                              <CheckCircle2 size={15} /> {t("vendor.bidSubmittedLabel")} ({existingBid.bidReference})
                            </span>
                          ) : (
                            <button className="btn-submit-bid-action" onClick={() => handleOpenBidWizard(tender)}>
                              <Send size={14} /> {t("vendor.submitBid")}
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
                  <h2>{t("vendor.submittedBidsTitle")}</h2>
                  <p className="subtext">{t("vendor.submittedBidsSubtitle")}</p>
                </div>
              </div>

              {bids.length === 0 ? (
                <div className="vendor-empty-state">{t("vendor.noBidsEmpty")}</div>
              ) : (
                <div className="bids-workspace-list">
                  {bids.map((bid) => {
                    const tenderInfo = tenders.find((tender) => tender.id === bid.tenderId);
                    const bidDocs = documentsMap[bid.id] || [];

                    return (
                      <div key={bid.id} className="bid-workspace-card">
                        <div className="bid-card-header">
                          <div className="bid-header-left">
                            <span className="bid-ref-tag">{bid.bidReference}</span>
                            <span className="status-chip-submitted">{bid.submissionStatus}</span>
                          </div>
                          <span className="bid-date-tag">
                            {t("vendor.submittedOn")} {new Date(bid.submittedAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="bid-card-body">
                          <h4>{t("vendor.tenderLabel")} {tenderInfo?.title || `${t("vendor.tenderRefLabel")} ${bid.tenderId}`}</h4>
                          <p className="bid-dept">{tenderInfo?.department || t("vendor.deptFallback")}</p>

                          {bid.bidMetadata?.quotedPrice > 0 && (
                            <div className="bid-quote-strip">
                              <span>{t("vendor.quotedPrice")} <strong>₹ {bid.bidMetadata.quotedPrice.toLocaleString("en-IN")}</strong></span>
                              <span>{t("vendor.deliveryTimeline")} <strong>{bid.bidMetadata.deliveryTimelineDays || 30} {t("vendor.daysUnit")}</strong></span>
                            </div>
                          )}

                          {/* Uploaded Documents List */}
                          <div className="bid-docs-section">
                            <h5>
                              <FileCheck size={16} /> {t("vendor.submittedDocuments")} ({bidDocs.length})
                            </h5>

                            {bidDocs.length === 0 ? (
                              <p className="no-docs-text">{t("vendor.noDocsText")}</p>
                            ) : (
                              <div className="docs-flex-list">
                                {bidDocs.map((doc) => (
                                  <div key={doc.id} className="doc-item-pill">
                                    <div className="doc-info font-bold">
                                      <span>{doc.originalFilename}</span>
                                      <small>{doc.documentType} • {(doc.fileSize / 1024).toFixed(1)} {t("vendor.fileSizeUnit")}</small>
                                    </div>
                                    <button
                                      onClick={() => handleDownloadDoc(doc)}
                                      className="btn-download-doc"
                                      title={t("vendor.downloadFileTitle")}
                                    >
                                      <Download size={13} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Officer decision feedback (visible after evaluation is final) */}
                          {(() => {
                            const fb = feedbackMap[bid.id];
                            if (!fb || !fb.available) return null;
                            const okCount = fb.items.filter((i) => i.status === "compliant").length;
                            return (
                              <div className="bid-docs-section">
                                <h5>
                                  <ShieldCheck size={16} /> {t("vendor.officerDecision")} ({okCount}/{fb.items.length} {t("vendor.compliantCount")})
                                </h5>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                  {fb.items.map((item) => (
                                    <div key={item.id} className="req-item-box">
                                      <div className="req-header">
                                        <strong>{item.requirement}</strong>
                                        <span className="req-cat-badge">{item.status === "compliant" ? t("vendor.fbCompliant") : item.status === "non_compliant" ? t("vendor.fbNonCompliant") : t("vendor.fbReview")}</span>
                                      </div>
                                      {item.officer_reason ? (
                                        <p><b>{t("vendor.officerReason")}</b> {item.officer_reason}</p>
                                      ) : (
                                        <p className="no-docs-text">{t("vendor.noReasonYet")}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Inline File Upload Form */}
                          <div className="bid-upload-area">
                            {activeUploadBidId === bid.id ? (
                              <form onSubmit={(e) => handleUploadDocument(e, bid.id)} className="upload-form-expanded">
                                <div className="form-row">
                                  <label>{t("vendor.docCategoryLabel")}</label>
                                  <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}>
                                    <option value="Technical Proposal">{t("vendor.docTypeTechnical")}</option>
                                    <option value="ISO 9001 Certificate">{t("vendor.docTypeIso")}</option>
                                    <option value="OEM Warranty Letter">{t("vendor.docTypeWarranty")}</option>
                                    <option value="Past Contract Experience">{t("vendor.docTypeExperience")}</option>
                                    <option value="Commercial Bid Financial Quote">{t("vendor.docTypeCommercial")}</option>
                                  </select>
                                </div>

                                <div className="form-row">
                                  <label>{t("vendor.selectFileLabel")}</label>
                                  <input
                                    type="file"
                                    required
                                    onChange={(e) => setFileToUpload(e.target.files[0])}
                                  />
                                </div>

                                <div className="form-btn-group">
                                  <button type="submit" disabled={isUploading} className="btn-upload-submit">
                                    {isUploading ? t("vendor.uploading") : t("vendor.uploadDocument")}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-upload-cancel"
                                    onClick={() => {
                                      setActiveUploadBidId(null);
                                      setFileToUpload(null);
                                    }}
                                  >
                                    {t("vendor.cancel")}
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <button className="btn-trigger-upload" onClick={() => setActiveUploadBidId(bid.id)}>
                                <Upload size={14} /> {t("vendor.uploadNewDoc")}
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
                  <h2>{t("vendor.awardedContractsTitle")}</h2>
                  <p className="subtext">{t("vendor.awardedContractsSubtitle")}</p>
                </div>
              </div>

              {contracts.length === 0 ? (
                <div className="vendor-empty-state">{t("vendor.noContractsEmpty")}</div>
              ) : (
                <div className="contracts-grid">
                  {contracts.map((contract) => (
                    <div key={contract.id} className="vendor-contract-card">
                      <div className="contract-card-header">
                        <span className="contract-ref-badge">{contract.contractReference}</span>
                        <span className="award-active-badge">{t("vendor.activeContract")}</span>
                      </div>
                      <h3>{t("vendor.contractAwarded")}</h3>
                      <p className="award-date">
                        {t("vendor.awardDateLabel")} {new Date(contract.awardedAt).toLocaleDateString()}
                      </p>
                      <div className="contract-actions">
                        <span className="award-eligible-tag">
                          <CheckCircle2 size={15} /> {t("vendor.compliantAssigned")}
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
              <p className="modal-dept">{t("vendor.departmentLabel")} {selectedTender.department}</p>
              <p className="modal-desc">{selectedTender.description}</p>

              <h4 className="reqs-title">{t("vendor.mandatoryRequirements")}</h4>
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
                <p className="no-reqs-text">{t("vendor.noReqsText")}</p>
              )}

              {!modalBid && (
                <p className="field-hint" style={{ marginTop: 12 }}>{t("vendor.submitFirstHint")}</p>
              )}

              {modalBid && (
                <div className="bid-docs-section" style={{ marginTop: 16 }}>
                  <h5>
                    <FileCheck size={16} /> {t("vendor.submittedDocuments")} ({modalBidDocs.length})
                  </h5>
                  {modalBidDocs.length > 0 && (
                    <div className="docs-flex-list" style={{ marginBottom: 12 }}>
                      {modalBidDocs.map((doc) => (
                        <div key={doc.id} className="doc-item-pill">
                          <div className="doc-info font-bold">
                            <span>{doc.originalFilename}</span>
                            <small>{doc.documentType}</small>
                          </div>
                          <button onClick={() => handleDownloadDoc(doc)} className="btn-download-doc" title={t("vendor.downloadFileTitle")}>
                            <Download size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <form onSubmit={(e) => handleUploadDocument(e, modalBid.id)} className="upload-form-expanded" style={{ marginBottom: 12 }}>
                    <div className="form-row">
                      <label>{t("vendor.docCategoryLabel")}</label>
                      <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}>
                        <option value="Technical Proposal">{t("vendor.docTypeTechnical")}</option>
                        <option value="ISO 9001 Certificate">{t("vendor.docTypeIso")}</option>
                        <option value="OEM Warranty Letter">{t("vendor.docTypeWarranty")}</option>
                        <option value="Past Contract Experience">{t("vendor.docTypeExperience")}</option>
                        <option value="Commercial Bid Financial Quote">{t("vendor.docTypeCommercial")}</option>
                      </select>
                    </div>
                    <div className="form-row">
                      <label>{t("vendor.selectFileLabel")}</label>
                      <input type="file" required onChange={(e) => setFileToUpload(e.target.files[0])} />
                    </div>
                    <div className="form-btn-group">
                      <button type="submit" disabled={isUploading} className="btn-upload-submit">
                        {isUploading ? t("vendor.uploading") : t("vendor.uploadDocument")}
                      </button>
                    </div>
                  </form>
                  <div className="upload-form-expanded">
                    <div className="form-row">
                      <label>{t("vendor.gemImportTitle")}</label>
                      <p className="subtext" style={{ margin: "0 0 8px" }}>{t("vendor.gemImportDesc")}</p>
                      <button
                        type="button"
                        className="btn-trigger-upload"
                        onClick={handleToggleGemPanel}
                      >
                        <Download size={14} /> {t("vendor.gemBrowseBtn")}
                      </button>
                      {gemPanelOpen && (
                        <div style={{ marginTop: 10 }}>
                          {gemLoading && <p className="subtext">{t("vendor.gemLoadingIds")}</p>}
                          {!gemLoading && gemBids.length === 0 && (
                            <p className="subtext">{t("vendor.gemNoIds")}</p>
                          )}
                          {!gemLoading && gemBids.map((bundle) => (
                            <div key={bundle.id} className="doc-item-pill" style={{ marginBottom: 8 }}>
                              <div className="doc-info font-bold">
                                <span className="mono">{bundle.id}</span>
                                <small>
                                  {bundle.seller || ""}
                                  {bundle.docs ? ` · ${bundle.docs.length} ${t("vendor.gemDocsUnit")}` : ""}
                                </small>
                              </div>
                              <button
                                type="button"
                                disabled={isImporting}
                                className="btn-upload-submit"
                                onClick={() => handleImportGem(modalBid.id, bundle.id)}
                              >
                                {isImporting ? t("vendor.gemImporting") : t("vendor.gemImportBtn")}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="field-hint" style={{ marginTop: 6 }}>{t("vendor.gemDemoHint")}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary-modal" onClick={() => setSelectedTender(null)}>
                {t("vendor.close")}
              </button>
              {!bids.some((b) => b.tenderId === selectedTender.id) && (
                <button
                  className="btn-primary-modal"
                  onClick={() => {
                    handleOpenBidWizard(selectedTender);
                  }}
                >
                  {t("vendor.prepareSubmitBid")}
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
                <span className="modal-ref-tag">{t("vendor.bidWizardTag")}</span>
                <h2>{t("vendor.submitBidFor")} {selectedTender.referenceNumber}</h2>
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
                  <label htmlFor="price">{t("vendor.quotedPriceLabel")}</label>
                  <input
                    id="price"
                    type="number"
                    required
                    placeholder={t("vendor.pricePlaceholder")}
                    value={bidForm.price}
                    onChange={(e) => setBidForm({ ...bidForm, price: e.target.value })}
                  />
                </div>

                <div className="form-group-modal">
                  <label htmlFor="timeline">{t("vendor.timelineLabel")}</label>
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
                  <label htmlFor="remarks">{t("vendor.remarksLabel")}</label>
                  <textarea
                    id="remarks"
                    rows={3}
                    placeholder={t("vendor.remarksPlaceholder")}
                    value={bidForm.remarks}
                    onChange={(e) => setBidForm({ ...bidForm, remarks: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary-modal" onClick={() => setIsBiddingModalOpen(false)}>
                  {t("vendor.cancel")}
                </button>
                <button type="submit" className="btn-primary-modal">
                  <Send size={15} /> {t("vendor.confirmSubmitBid")}
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
              <h2>{t("vendor.editProfileTitle")}</h2>
              <button className="modal-close-btn" onClick={() => setIsEditProfileOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div className="modal-body">
                <div className="form-group-modal">
                  <label>{t("vendor.legalNameLabel")}</label>
                  <input
                    type="text"
                    required
                    value={profileForm.legalName}
                    onChange={(e) => setProfileForm({ ...profileForm, legalName: e.target.value })}
                  />
                </div>

                <div className="form-group-modal">
                  <label>{t("vendor.phoneLabel")}</label>
                  <input
                    type="text"
                    required
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  />
                </div>

                <div className="form-group-modal">
                  <label>{t("vendor.businessCategoryLabel")}</label>
                  <select
                    value={profileForm.category}
                    onChange={(e) => setProfileForm({ ...profileForm, category: e.target.value })}
                  >
                    <option value="MSME">{t("vendor.categoryMsme")}</option>
                    <option value="Startup">{t("vendor.categoryStartup")}</option>
                    <option value="Enterprise">{t("vendor.categoryEnterprise")}</option>
                  </select>
                </div>

                <div className="form-group-modal">
                  <label>{t("vendor.gstinNumberLabel")}</label>
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
                  {t("vendor.cancel")}
                </button>
                <button type="submit" className="btn-primary-modal">
                  <Check size={15} /> {t("vendor.saveChanges")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
