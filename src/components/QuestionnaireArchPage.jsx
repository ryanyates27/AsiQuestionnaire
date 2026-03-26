// src/components/QuestionnaireArchivePage.jsx
// UPDATED: Multi-PDF per Site+Year UI (expand year -> list files)
// - Supports multi-upload in Create modal
// - Year panel actions: Download All / Delete Year
// - Click a file to preview that specific PDF

import React, { useState, useEffect, useMemo, useRef } from "react";
import Fuse from "fuse.js";
import PageWrapper from "./PageWrapper";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { FiUploadCloud } from "react-icons/fi";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// -----------------------------------------------------------------------------
// Lightweight PDF.js canvas renderer
// -----------------------------------------------------------------------------
function PDFCanvasViewer({ dataUrl }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!dataUrl || !containerRef.current) return;

    (async () => {
      try {
        containerRef.current.innerHTML = "";
        const pdf = await pdfjsLib.getDocument({ url: dataUrl }).promise;
        const pageCount = pdf.numPages;
        for (let p = 1; p <= pageCount; p++) {
          if (cancelled) break;
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 1.0 });
          const targetWidth = containerRef.current.clientWidth || 900;
          const scale = targetWidth / viewport.width;
          const scaledViewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.style.display = "block";
          canvas.style.margin = "0 auto 12px auto";
          canvas.width = Math.floor(scaledViewport.width);
          canvas.height = Math.floor(scaledViewport.height);

          await page.render({ canvasContext: ctx, viewport: scaledViewport })
            .promise;
          containerRef.current.appendChild(canvas);
        }
      } catch (err) {
        console.error("PDF render failed", err);
        containerRef.current.innerHTML =
          '<div style="padding:12px;color:#900;">Unable to render PDF.</div>';
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        background: "#f7f7f7",
        padding: 8,
        boxSizing: "border-box",
      }}
    />
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function isPdfFile(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
}

function basename(p) {
  if (!p) return "";
  const s = String(p);
  const parts = s.split(/[/\\]+/);
  return parts[parts.length - 1] || s;
}

function displayArchiveFileName(nameOrPath) {
  const raw = basename(nameOrPath || "");
  if (!raw) return "";

  // PB cache pattern: <site>__<year>__<pbId>__<originalName.ext>
  const fromCache = raw.match(/^.+__\d{4}__[a-z0-9]+__(.+)$/i);
  const candidate = fromCache ? fromCache[1] : raw;

  const parsed = /^(.*?)(\.[^.]+)?$/i.exec(candidate);
  let base = (parsed?.[1] || candidate).trim();
  let ext = (parsed?.[2] || "").trim();

  // Fix legacy "...pdf.pdf" names by collapsing duplicate extension.
  if (/^(\.[a-z0-9]+)\1$/i.test(ext)) {
    ext = ext.slice(0, ext.length / 2);
  }

  // Fix legacy names where extension dot was dropped: "...pdf.pdf" -> "....pdf"
  if (/\.pdf$/i.test(ext) && /pdf$/i.test(base)) {
    base = base.replace(/pdf$/i, "") || base;
  }

  return `${base}${ext}`;
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function QuestionnaireArchivePage({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // CHANGED: allow multiple files in create modal
  const [form, setForm] = useState({ siteName: "", year: "", files: [] });
  const [error, setError] = useState("");

  const [toastMsg, setToastMsg] = useState("");
  const showToast = (msg, ms = 2500) => {
    setToastMsg(msg);
    if (ms) setTimeout(() => setToastMsg(""), ms);
  };

  const [previewing, setPreviewing] = useState(false);
  const [selected, setSelected] = useState(null); // { siteName, year, file: {id, filePath?, fileName?, pbFileName?}, preview... }

  // Drag-and-drop helpers
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Publish state for PDF's to PocketBase
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");

  // NEW: expanded year per site
  const [expanded, setExpanded] = useState(null); // { siteName, year } or null

  const onPublish = async () => {
    setPublishing(true);
    setPublishMsg("Publishing PDFs to server…");
    try {
      const res = await window.api.archive.publish();
      if (!res?.ok) {
        const first = res?.errors?.[0];
        setPublishMsg(
          `Publish finished with issues. Created: ${res.created}, Updated: ${res.updated}, Skipped: ${res.skipped}, Failed: ${res.failed}` +
            (first
              ? ` | First error: ${first.status || ""} ${first.message || ""}`
              : ""),
        );
      } else {
        setPublishMsg(
          `Published. Created: ${res.created}, Updated: ${res.updated}, Skipped: ${res.skipped}.`,
        );
      }
    } catch (e) {
      setPublishMsg(`Publish failed: ${String(e)}`);
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    async function load() {
      try {
        const rows = await window.api.getArchiveEntries();
        setEntries(rows || []);
      } catch (e) {
        console.error("Failed to load archive entries", e);
        showToast("Failed to load archive entries.", 3000);
      }
    }
    load();
  }, []);

  // Sites list (searchable)
  const sites = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.siteName))).map((name) => ({
        name,
      })),
    [entries],
  );

  const fuse = useMemo(
    () => new Fuse(sites, { keys: ["name"], threshold: 0.3 }),
    [sites],
  );
  const filteredSites = query ? fuse.search(query).map((r) => r.item) : sites;

  // CHANGED: build site -> year -> files[] grouping
  // Supports local mode (one row per filePath) AND PB mode (if future returns files array)
  const grouped = useMemo(() => {
    const out = {}; // { [siteName]: { [year]: { siteName, year, files: [...] } } }

    for (const e of entries) {
      const siteName = e.siteName;
      const year = Number(e.year || 0);

      if (!out[siteName]) out[siteName] = {};
      if (!out[siteName][year])
        out[siteName][year] = { siteName, year, files: [] };

      // Local row case
      if (e.filePath) {
        out[siteName][year].files.push({
          id: e.id, // local DB id
          filePath: e.filePath,
          fileName: displayArchiveFileName(e.filePath),
        });
        continue;
      }

      // PB-style case (if you later return `files` from main)
      // expected: e.files = ["A_xxx.pdf","B_xxx.pdf"] or e.fileUrl for first
      if (Array.isArray(e.files) && e.files.length) {
        for (const pbFileName of e.files) {
          out[siteName][year].files.push({
            id: e.id, // PB record id
            pbFileName, // stored PB filename
            fileName: displayArchiveFileName(pbFileName), // display name (strips PB cache prefix)
          });
        }
        continue;
      }

      // Legacy PB UI case: only first fileUrl
      if (e.fileUrl) {
        out[siteName][year].files.push({
          id: e.id,
          pbFileUrl: e.fileUrl,
          fileName: "PDF",
        });
      }
    }

    // sort files by name
    for (const s of Object.keys(out)) {
      for (const y of Object.keys(out[s])) {
        out[s][y].files.sort((a, b) =>
          (a.fileName || "").localeCompare(b.fileName || ""),
        );
      }
    }

    return out;
  }, [entries]);

  // -------------------------
  // Create modal: multi upload
  // -------------------------
  const handleFilesSelected = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const bad = files.find((f) => !isPdfFile(f));
    if (bad) {
      setError("Please choose PDF files only.");
      return;
    }
    setError("");
    setForm((f) => ({ ...f, files }));
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    handleFilesSelected(files);
  };

  const resetForm = () => {
    setForm({ siteName: "", year: "", files: [] });
    setError("");
    setDragActive(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.siteName.trim() || !form.year || !form.files?.length) {
      setError("All fields are required.");
      return;
    }

    const yearNum = Number(form.year);
    const currentYear = new Date().getFullYear();
    if (isNaN(yearNum) || yearNum < 1990 || yearNum > currentYear + 1) {
      setError("Enter a valid year.");
      return;
    }

    try {
      const addedRows = [];

      // CHANGED: save EACH selected file as its own local archive row
      for (const file of form.files) {
        const arrayBuf = await file.arrayBuffer();
        const newRow = await window.api.addArchiveEntry({
          siteName: form.siteName.trim(),
          year: yearNum,
          filename: file.name,
          buffer: Array.from(new Uint8Array(arrayBuf)),
        });
        addedRows.push(newRow);
      }

      setEntries((prev) => [...prev, ...addedRows]);
      setShowCreate(false);
      resetForm();
      showToast(`Saved ${addedRows.length} PDF(s) to archive.`);
    } catch (err) {
      console.error(err);
      setError("Failed to save entry.");
      showToast("Failed to save entry.", 3000);
    }
  };

  useEffect(() => {
    if (!showCreate) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setShowCreate(false);
        resetForm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCreate]);

  // -------------------------
  // Preview / Actions
  // -------------------------
  const handlePreviewFile = async (siteName, year, file) => {
    setSelected({ siteName, year, file });
    setPreviewing(true);

    try {
      // NEW: prefer per-file preview (works for local id OR PB id + fileName)
      const r2 = await window.api.getArchivePreviewDataUrl({
        id: file.id,
        fileName: file.pbFileName || file.fileName, // main can ignore when local
      });
      if (r2?.ok && r2?.dataUrl) {
        setSelected((prev) => ({ ...prev, previewDataUrl: r2.dataUrl }));
        return;
      }
    } catch {}

    try {
      const r = await window.api.getArchivePreviewUrl({
        id: file.id,
        fileName: file.pbFileName || file.fileName,
      });
      if (r?.ok && r?.href) {
        setSelected((prev) => ({ ...prev, previewHref: r.href }));
      }
    } catch {}
  };

  const closePreview = () => {
    setPreviewing(false);
    setSelected(null);
  };

  const handleOpenFull = () => {
    if (!selected?.file) return;
    window.api.openArchivePDF({
      id: selected.file.id,
      filePath: selected.file.filePath,
      fileName: selected.file.pbFileName || selected.file.fileName,
    });
  };

  const handleDownloadOne = async () => {
    if (!selected?.file) return;
    try {
      await window.api.downloadArchiveEntry({
        id: selected.file.id,
        fileName: selected.file.pbFileName || selected.file.fileName,
      });
      showToast("Download started.");
    } catch (e) {
      console.error("Download failed", e);
      showToast("Download failed.", 3000);
    }
  };

  // NEW: Download all for the expanded year
  const handleDownloadAllYear = async (siteName, year) => {
    try {
      const r = await window.api.archive.downloadYear({ siteName, year });
      if (r?.ok) showToast("Downloaded year PDFs.");
      else showToast("Download all failed.", 3000);
    } catch (e) {
      console.error(e);
      showToast("Download all failed.", 3000);
    }
  };

  // NEW: Delete year (all files)
  const handleDeleteYear = async (siteName, year) => {
    const ok = window.confirm(
      `Delete "${siteName} - ${year}" and ALL PDFs for that year?`,
    );
    if (!ok) return;

    try {
      const r = await window.api.archive.deleteYear({ siteName, year });
      if (!r?.ok) throw new Error("deleteYear failed");

      // remove matching local rows from UI (PB mode will refresh on reload)
      setEntries((prev) =>
        prev.filter(
          (e) => !(e.siteName === siteName && Number(e.year) === Number(year)),
        ),
      );

      // collapse panel if it was open
      setExpanded((prev) => {
        if (prev?.siteName === siteName && prev?.year === year) return null;
        return prev;
      });

      showToast("Year deleted.");
    } catch (e) {
      console.error(e);
      showToast("Delete failed.", 3000);
    }
  };

  // Backwards compatible: single delete (from modal) deletes only that file
  const handleDeleteOne = async () => {
    if (!selected?.file) return;

    const label = selected?.file?.fileName || "PDF";
    const ok = window.confirm(
      `Delete "${selected.siteName} - ${selected.year}" file "${label}"?`,
    );
    if (!ok) return;

    try {
      await window.api.removeArchiveEntry({ id: selected.file.id });

      // remove from entries list
      setEntries((prev) => prev.filter((e) => e.id !== selected.file.id));
      closePreview();
      showToast("File deleted.");
    } catch (e) {
      console.error("Delete failed", e);
      showToast("Delete failed.", 3000);
    }
  };

  useEffect(() => {
    if (!previewing) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        closePreview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewing]);

  const toggleYear = (siteName, year) => {
    setExpanded((prev) => {
      if (prev?.siteName === siteName && prev?.year === year) return null;
      return { siteName, year };
    });
  };

  return (
    <PageWrapper onBack={onBack} title="Questionnaire Archive">
      {toastMsg && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 20,
            zIndex: 9999,
            background: "#333",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 6,
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* Search + Actions */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search sites..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              padding: "8px",
              fontSize: "1rem",
              boxSizing: "border-box",
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onPublish}
              disabled={publishing}
              title="Upload local PDFs to the server so other machines can sync them"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                background: publishing ? "#9db2d6" : "#4377ff",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: publishing ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <FiUploadCloud />
              {publishing ? "Publishing…" : "Publish to Server"}
            </button>

            <button
              onClick={() => {
                resetForm();
                setShowCreate(true);
              }}
              style={{ padding: "8px 12px" }}
            >
              Create
            </button>
          </div>
        </div>

        {publishMsg && (
          <div
            style={{
              padding: "8px 10px",
              border: "1px solid #ddd",
              borderRadius: 6,
              background: "#f8f8f8",
              color: "#333",
              fontSize: "0.9rem",
            }}
          >
            {publishMsg}
          </div>
        )}
      </div>

      {/* Sites + Years */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {filteredSites.map((site) => {
          const siteYears = grouped[site.name] || {};
          const yearsSorted = Object.keys(siteYears)
            .map((y) => Number(y))
            .sort((a, b) => b - a);

          return (
            <div
              key={site.name}
              style={{
                border: "1px solid #ccc",
                borderRadius: 4,
                padding: "8px",
                background: "#F5F4F4",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: 6 }}>
                {site.name}
              </div>

              {/* year pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {yearsSorted.map((year) => {
                  const isOpen =
                    expanded?.siteName === site.name && expanded?.year === year;
                  const count = siteYears[year]?.files?.length || 0;

                  return (
                    <button
                      key={`${site.name}-${year}`}
                      onClick={() => toggleYear(site.name, year)}
                      title="Show PDFs for this year"
                      style={{
                        padding: "6px 10px",
                        background: isOpen ? "#dcdcdc" : "#E2E0E0",
                        border: "1px solid #bbb",
                        borderRadius: 999,
                        cursor: "pointer",
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <span>{year}</span>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          opacity: 0.75,
                          borderLeft: "1px solid #bbb",
                          paddingLeft: 8,
                        }}
                      >
                        {count} file{count === 1 ? "" : "s"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* expanded year panel */}
              {expanded?.siteName === site.name && siteYears[expanded.year] && (
                <div
                  style={{
                    marginTop: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <div style={{ fontWeight: 600, flex: 1 }}>
                      {site.name} • {expanded.year}
                    </div>

                    <button
                      onClick={() =>
                        handleDownloadAllYear(site.name, expanded.year)
                      }
                      style={{ padding: "6px 10px" }}
                    >
                      Download All
                    </button>

                    <button
                      onClick={() => handleDeleteYear(site.name, expanded.year)}
                      style={{
                        padding: "6px 10px",
                        background: "#ffe9e9",
                        border: "1px solid #f2b3b3",
                      }}
                    >
                      Delete Year
                    </button>
                  </div>

                  <div
                    style={{
                      padding: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {(siteYears[expanded.year]?.files || []).map((f) => (
                      <button
                        key={`${f.id}-${f.fileName || f.pbFileName || "file"}`}
                        onClick={() =>
                          handlePreviewFile(site.name, expanded.year, f)
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1px solid #eee",
                          background: "#fafafa",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        title="Preview PDF"
                      >
                        {/* generic file icon */}
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            background: "#e8e8e8",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#444",
                          }}
                        >
                          PDF
                        </div>

                        <div style={{ flex: 1, color: "#222" }}>
                          {f.fileName || f.pbFileName || "PDF"}
                        </div>

                        <div style={{ opacity: 0.6 }}>›</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div
          onClick={() => {
            setShowCreate(false);
            resetForm();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              padding: "1rem",
              borderRadius: 8,
              width: "100%",
              maxWidth: 460,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <h3 style={{ margin: 0 }}>New Questionnaire PDF(s)</h3>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                }}
              >
                ✖
              </button>
            </div>

            <form
              onSubmit={handleCreate}
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <input
                type="text"
                placeholder="Site Name"
                value={form.siteName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, siteName: e.target.value }))
                }
                style={{ padding: 6 }}
              />

              <input
                type="number"
                placeholder="Year"
                value={form.year}
                onChange={(e) =>
                  setForm((f) => ({ ...f, year: e.target.value }))
                }
                style={{ padding: 6 }}
              />

              {/* Hidden file input only used programmatically */}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple // CHANGED
                onChange={(e) => handleFilesSelected(e?.target?.files)}
                style={{ display: "none" }}
              />

              {/* Drag & Drop Zone (also opens file dialog on click) */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                style={{
                  marginTop: 6,
                  padding: "16px",
                  borderRadius: 8,
                  border: `2px dashed ${dragActive ? "#3b82f6" : "#bbb"}`,
                  background: dragActive ? "rgba(59,130,246,0.06)" : "#fafafa",
                  color: "#444",
                  textAlign: "center",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                title="Drop PDFs here or click to choose"
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Drag & drop PDF(s) here
                </div>
                <div style={{ fontSize: "0.9rem" }}>
                  or click to choose files
                </div>
              </div>

              {!!form.files?.length && (
                <div style={{ fontSize: "0.9rem", color: "#333" }}>
                  Selected:
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {form.files.map((f) => (
                      <div key={f.name}>
                        • <strong>{f.name}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div style={{ color: "red", fontSize: "0.85rem" }}>{error}</div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="submit" style={{ padding: "6px 12px" }}>
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    resetForm();
                  }}
                  style={{ padding: "6px 12px" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewing && selected && (
        <div
          onClick={closePreview}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              width: "95%",
              maxWidth: 1000,
              height: "90vh",
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                borderBottom: "1px solid #eee",
              }}
            >
              <div style={{ fontWeight: 600, flex: 1 }}>
                {selected.siteName} • {selected.year} •{" "}
                {selected.file?.fileName || selected.file?.pbFileName || "PDF"}
              </div>

              <button
                onClick={handleDownloadOne}
                style={{ padding: "6px 10px" }}
              >
                Download
              </button>

              <button
                onClick={handleDeleteOne}
                style={{
                  padding: "6px 10px",
                  background: "#ffe9e9",
                  border: "1px solid #f2b3b3",
                }}
              >
                Delete
              </button>

              <button onClick={handleOpenFull} style={{ padding: "6px 10px" }}>
                Open
              </button>

              <button
                onClick={() => {
                  setPreviewing(false);
                  setSelected(null);
                }}
                style={{ padding: "6px 10px" }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                background: "#f7f7f7",
                padding: "8px 0",
              }}
            >
              {selected.previewDataUrl ? (
                <PDFCanvasViewer dataUrl={selected.previewDataUrl} />
              ) : selected.previewHref ? (
                <embed
                  key={`href-${selected.file?.id}`}
                  src={selected.previewHref}
                  type="application/pdf"
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              ) : (
                <div style={{ padding: 16, color: "#555" }}>
                  Loading preview…
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
