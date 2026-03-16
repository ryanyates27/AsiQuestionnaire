// electron/main.js
// Fresh main process file with AI Ask IPC + PocketBase integration.
// - Keeps your existing CRUD + archive IPCs
// - Adds 'pocketbase' backend mode controlled by config.apiEndpoint
// - Adds PB health/login/CRUD/vectors/archive upload routes
// - Gracefully shuts down the local LLM on quit

import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import util from "node:util";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

import {
  searchAllQuestions,
  searchApprovedQuestions,
  addQuestion,
  editQuestion,
  removeQuestion,
  approveQuestion,
  findSimilarApproved,
  loginUser,
} from "./QueryService.js";

import {
  getAllArchiveEntries,
  insertArchiveEntry,
  attachPocketBaseId,
  rebuildFTS, // already imported here; no require later
  getArchiveEntryById,
  deleteArchiveEntryById,
} from "./SQLiteService.js";

// --- AI Semantic Ask (embeddings + optional LLM) ---
import { askSemantic } from "./AISemanticQA.js";

// Bundled LLM wrapper (your Phi-3 lives behind this)
import {
  shutdownLLM,
  chatWithContext,
  engineFilesOk,
} from "./BundledAIService.js";

// PocketBase SDK
import PocketBase from "pocketbase";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NEW: stable composite key (used only if you ever need fallback matching)
const norm = (s) => (s ?? "").toString().trim().toLowerCase();
const makeKey = (o) =>
  `${norm(o.siteName)}|${norm(o.tag)}|${norm(o.subtag)}|${norm(o.question)}`;

// Global error handlers (some async PB errors can get swallowed)
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});

// ---------------------------
// Config (persisted per user)
// ---------------------------
const configPath = path.join(app.getPath("userData"), "config.json");
let config = { apiEndpoint: "local" };
try {
  const raw = fs.readFileSync(configPath, "utf-8");
  config = JSON.parse(raw);
} catch {
  // first run: use defaults
}

// PocketBase client (lazy)
let pbClient = null;
let mainWindow = null;

function getPB() {
  const baseUrl =
    (typeof config?.pbUrl === "string" && config.pbUrl) ||
    process.env.PB_URL ||
    "http://10.30.0.131:8080";
  if (!pbClient) pbClient = new PocketBase(baseUrl);
  return pbClient;
}

// CHANGED: return *all* files + urls (not just first)
function pbArchiveToUi(pb, rec) {
  const siteName = rec.siteName ?? "";
  const year = Number(rec.year ?? 0);

  const files = Array.isArray(rec.files)
    ? rec.files
    : typeof rec.files === "string" && rec.files
    ? [rec.files]
    : [];

  const fileUrls = files.map((fn) => pb.files.getUrl(rec, fn));

  return { id: rec.id, siteName, year, files, fileUrls };
}

// ---------------------------------------------
// NEW: PocketBase filename helpers
// PB stores uploaded file names like: MyFile_Ab12Cd34Ef.pdf
// We strip the trailing "_<random>" so we can compare against local filenames.
// ---------------------------------------------
function pbOriginalFileName(storedName) {
  if (!storedName) return "";
  const s = String(storedName);

  // "<base>_<random10>.<ext>" -> "<base>.<ext>"
  const m = s.match(/^(.*)_[A-Za-z0-9]{10}(\.[^./\\]+)$/i);
  return m ? `${m[1]}${m[2]}` : s;
}

function sameFileName(localName, pbStoredName) {
  const a = (localName || "").trim().toLowerCase();
  const b = pbOriginalFileName(pbStoredName).trim().toLowerCase();
  return !!a && a === b;
}

// NEW: download all local PDFs for a site+year to a chosen folder
ipcMain.handle("archive.downloadYear", async (event, { siteName, year }) => {
  const win = event?.sender?.getOwnerBrowserWindow?.() || null;

  const y = Number(year);
  const s = (siteName || "").trim();
  if (!s || !y) return { ok: false, error: "Missing siteName/year" };

  const matches = getAllArchiveEntries().filter(
    (r) => r.siteName === s && Number(r.year) === y
  );
  if (!matches.length) return { ok: false, error: "No files found for year" };

  const pick = await dialog.showOpenDialog(win, {
    title: "Choose folder to save PDFs",
    properties: ["openDirectory", "createDirectory"],
  });
  if (pick.canceled || !pick.filePaths?.[0])
    return { ok: false, canceled: true };

  const dir = pick.filePaths[0];

  for (const row of matches) {
    if (!row.filePath || !fs.existsSync(row.filePath)) continue;
    const dest = path.join(dir, path.basename(row.filePath));
    fs.copyFileSync(row.filePath, dest);
  }

  return { ok: true, count: matches.length, dir };
});

// NEW: delete all local PDFs + rows for a site+year
ipcMain.handle("archive.deleteYear", async (_event, { siteName, year }) => {
  const y = Number(year);
  const s = (siteName || "").trim();
  if (!s || !y) return { ok: false, error: "Missing siteName/year" };

  const matches = getAllArchiveEntries().filter(
    (r) => r.siteName === s && Number(r.year) === y
  );
  if (!matches.length) return { ok: true, deleted: 0 };

  for (const row of matches) {
    try {
      if (row.filePath && fs.existsSync(row.filePath))
        fs.unlinkSync(row.filePath);
    } catch (e) {
      if (e.code !== "ENOENT")
        console.warn("[Archive] unlink failed:", row.filePath, e);
    }
    deleteArchiveEntryById(row.id);
  }

  // Optional: also soft-delete on PB if you want:
  // (you already do this for single delete in removeArchiveEntry)

  return { ok: true, deleted: matches.length };
});

// --- Sync state kept in main (blocks login in renderer while running)
const syncState = {
  phase: "idle", // 'idle' | 'checking' | 'syncing' | 'ok' | 'error' | 'offline'
  message: "",
  startedAt: null,
  finishedAt: null,
};
function setSyncState(patch) {
  Object.assign(syncState, patch);
  try {
    mainWindow?.webContents?.send("sync.state", syncState);
  } catch (_) {}
}

// Persist last successful sync time
const syncMetaPath = path.join(app.getPath("userData"), "sync_meta.json");
function readLastSync() {
  try {
    return JSON.parse(fs.readFileSync(syncMetaPath, "utf-8")).lastSync || null;
  } catch {
    return null;
  }
}
function writeLastSync(tsISO) {
  fs.writeFileSync(syncMetaPath, JSON.stringify({ lastSync: tsISO }), "utf-8");
}

// ---- Heuristic fallback rewrite (NEW) ----
function heuristicRewrite(s) {
  if (!s) return s;
  let out = String(s).trim();

  // soften punctuation + break long clauses
  out = out.replace(/\s*-\s*/g, " — ").replace(/\s{2,}/g, " ");
  out = out.replace(/;(\s+)/g, ". ").replace(/,(\s+which)/gi, ". Which");

  // quick synonym swaps to force visible difference
  const swaps = [
    [/utilize/gi, "use"],
    [/prior to/gi, "before"],
    [/subsequent/gi, "later"],
    [/ensure/gi, "make sure"],
    [/in order to/gi, "to"],
  ];
  for (const [re, rep] of swaps) out = out.replace(re, rep);

  // short preface to make the change obvious
  return `In short: ${out}`;
}

// tiny comparer to detect “no real change”
const normText = (x) =>
  String(x || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// --- Service-account login (used for sync/publish)
// CHANGED: make pbEnsureLogin actually ensure auth (or throw)
async function pbEnsureLogin() {
  const pb = getPB();

  // already authed
  if (pb.authStore?.isValid) return pb;

  // try config/env creds
  const identity = (config && config.pbIdentity) || process.env.PB_IDENTITY;
  const password = (config && config.pbPassword) || process.env.PB_PASSWORD;

  if (!identity || !password) {
    // IMPORTANT: don't silently proceed as guest
    throw new Error(
      "PocketBase not logged in. Please use the PocketBase Login in the app (or set pbIdentity/pbPassword in config)."
    );
  }

  await pb.collection("users").authWithPassword(identity, password);

  console.log(
    "[pbEnsureLogin] authed?",
    pb.authStore.isValid,
    "model?",
    pb.authStore.model?.id
  );

  return pb;
}

// helper to fetch all PB questions (not just approved)
async function pbGetAllQuestions(pb) {
  return await pb.collection("questions").getFullList();
}

// Small helper to paraphrase text with the bundled LLM (Phi-3 via BundledAIService)
async function rewriteWithLLM(text) {
  if (!text || !engineFilesOk()) return text;
  const system =
    "You rewrite answers clearly and concisely. Keep meaning. Do not copy long phrases verbatim.";
  const user = `Rewrite this answer in 2–4 sentences. Keep facts the same.\n\n"""${text}"""`;
  const out = await chatWithContext(system, user);
  return (out || "").trim() || text;
}

async function syncArchiveFromPocketBase({ silent = false } = {}) {
  // CHANGED: do not depend on apiEndpoint; just try PB sync when PB is reachable/auth'd
  // if (!config?.pbUrl && !process.env.PB_URL) {
  //   return { pulled: 10, added: 0, skipped: 0 };
  // }

  const pb = getPB();

  // require auth if your rules do; otherwise archive list may fail silently
  await pbEnsureLogin();

  const remote = await pb
    .collection("questionnaire_archive")
    .getFullList({ sort: "-created", filter: "isDeleted = false" });

  // Build a set of existing local paths to avoid duplicate INSERTs
  const local = getAllArchiveEntries();
  const havePath = new Set(local.map((r) => (r.filePath || "").toLowerCase()));

  let pulled = 0,
    added = 0,
    skipped = 0;

  for (const rec of remote) {
    const files = pbGetFilesList(rec);
    if (!files.length) continue;

    for (const storedName of files) {
      pulled++;

      // Downloads/caches into your archive dir with pbId+filename in the name
      const localPath = await ensurePbArchiveCached(pb, rec, storedName);

      if (havePath.has(localPath.toLowerCase())) {
        skipped++;
        continue;
      }

      // Insert local row (1 row per file)
      insertArchiveEntry({
        siteName: safeName(rec.siteName || "Site"),
        year: Number(rec.year || 0),
        filePath: localPath,
      });

      havePath.add(localPath.toLowerCase());
      added++;
    }
  }

  return { pulled, added, skipped };
}

// ---------------------------
// Phase 1: Pull-down sync (PB → Local)
// ---------------------------
async function runInitialSync(opts = {}) {
  const silent = !!opts.silent;

  if (!silent) {
    setSyncState({
      phase: "checking",
      message: "Checking server…",
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
  }

  const pb = getPB(); // don't try to log in until we know it's reachable

  // ---- 1. Quick reachability probe ----
  let reachable = true;
  try {
    await pb.collection("questions").getList(1, 1);
  } catch {
    reachable = false;
  }

  // ---- 2. If unreachable, switch to offline mode and stop here ----
  if (!reachable) {
    console.warn("[SYNC] PocketBase not reachable — going offline.");
    if (!silent) {
      setSyncState({
        phase: "offline",
        message:
          "Offline: No internet or PocketBase unreachable. Using local DB.",
        finishedAt: new Date().toISOString(),
      });
    }
    return; // stop sync early
  }

  // ---- 3. Try service login (don’t throw if it fails) ----
  try {
    await pbEnsureLogin();
  } catch (e) {
    console.warn(
      "[SYNC] login failed (offline creds or auth issue):",
      e?.message || e
    );
  }

  console.log("[PB] auth valid:", !!pb.authStore?.isValid);
  if (!silent) {
    setSyncState({ phase: "syncing", message: "Syncing from server…" });
  }

  // ---- 4. Pull data and upsert locally ----
  try {
    const list = await pb.collection("questions").getFullList({
      filter: "isDeleted = false",
      sort: "+updated",
    });
    console.log("[PB] pulled", list.length, "question(s)");

    const localAll = searchAllQuestions("");
    const localByPbId = new Map(localAll.map((r) => [r.pb_id, r]));
    const localByKey = new Map(localAll.map((r) => [makeKey(r), r]));

    let updatedCount = 0;

    for (const q of list) {
      if (q.isDeleted) continue;
      const approvedInt = q.approved ? 1 : 0;

      const key = makeKey(q);
      const byPb = localByPbId.get(q.id);
      const byKey = localByKey.get(key);

      try {
        if (byPb) {
          await editQuestion({
            id: byPb.id,
            pb_id: q.id,
            siteName: q.siteName,
            tag: q.tag,
            subtag: q.subtag,
            question: q.question,
            answer: q.answer,
            additionalInfo: q.additionalInfo || "",
            approved: approvedInt,
          });
        } else if (byKey) {
          await editQuestion({
            id: byKey.id,
            pb_id: q.id,
            siteName: q.siteName,
            tag: q.tag,
            subtag: q.subtag,
            question: q.question,
            answer: q.answer,
            additionalInfo: q.additionalInfo || "",
            approved: approvedInt,
          });
        } else {
          await addQuestion({
            pb_id: q.id,
            siteName: q.siteName,
            tag: q.tag,
            subtag: q.subtag,
            question: q.question,
            answer: q.answer,
            additionalInfo: q.additionalInfo || "",
            approved: approvedInt,
          });
        }

        updatedCount++;
        if (!silent && updatedCount % 25 === 0) {
          setSyncState({
            phase: "syncing",
            message: `Syncing… ${updatedCount} records`,
          });
        }
      } catch (e) {
        console.error("PB→Local upsert error for", q.id, e);
      }
    }

    // optional: rebuild FTS for search visibility
    try {
      await rebuildFTS?.();
    } catch (e) {
      console.warn("FTS rebuild failed (non-fatal):", e);
    }

    // ---- 5. Pull archive PDFs (PB → Local) ----
    try {
      const arch = await syncArchiveFromPocketBase({ silent });
      console.log("[PB] archive pulled:", arch);

      if (!silent) {
        setSyncState({
          phase: "syncing",
          message: `Syncing… archive added ${arch.added}, skipped ${arch.skipped}`,
        });
      }
    } catch (e) {
      console.warn("[SYNC] archive pull failed (non-fatal):", e?.message || e);
    }

    writeLastSync(new Date().toISOString());
    if (!silent) {
      setSyncState({
        phase: "ok",
        message: `Sync complete: ${updatedCount} record(s) updated.`,
        finishedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error("[SYNC] fatal error during PB→Local sync:", e);
    if (!silent) {
      setSyncState({
        phase: "error",
        message: `Sync error: ${String(e)}`,
        finishedAt: new Date().toISOString(),
      });
    }
  }
}

// ---------------------------
// Config IPC
// ---------------------------
ipcMain.handle("getConfig", () => config);
ipcMain.handle("setConfig", (_e, newCfg) => {
  config = { ...config, ...newCfg };
  fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");
  // Reset PB client if base URL/mode changed
  if (newCfg.pbUrl !== undefined || newCfg.apiEndpoint !== undefined) {
    pbClient = null;
  }
  return config;
});

// ---------------------------
// Publish snapshot (Local → PB)
// ---------------------------
ipcMain.handle("sync.publish", async () => {
  const pb = await pbEnsureLogin();

  // pull latest remote set
  const remote = await pbGetAllQuestions(pb);

  // helper key
  const n = (s) => (s ?? "").toString().trim().toLowerCase();
  const mk = (o) =>
    `${n(o.siteName)}|${n(o.tag)}|${n(o.subtag)}|${n(o.question)}`;

  // lookups
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const remoteByKey = new Map(remote.map((r) => [mk(r), r]));

  // local full set
  const local = searchAllQuestions("");

  // ---- build diff (use pb_id first, then key) ----
  const toCreate = [];
  const toUpdate = []; // { targetId, row }
  const toSoftDelete = [];

  for (const row of local) {
    const pbTargetIdFromLocal = row.pb_id || null;
    const byKey = remoteByKey.get(mk(row));
    const pbTargetIdFromKey = byKey?.id || null;
    const pbTargetId = pbTargetIdFromLocal || pbTargetIdFromKey;

    if (pbTargetId) {
      const r = remoteById.get(pbTargetId) || byKey;
      const changed =
        (r?.siteName ?? "") !== row.siteName ||
        (r?.tag ?? "") !== row.tag ||
        (r?.subtag ?? "") !== row.subtag ||
        (r?.question ?? "") !== row.question ||
        (r?.answer ?? "") !== row.answer ||
        (r?.additionalInfo ?? "") !== (row.additionalInfo ?? "") ||
        !!r?.approved !== (row.approved === 1) ||
        !!r?.isDeleted !== false;

      if (changed) toUpdate.push({ targetId: pbTargetId, row });
    } else {
      toCreate.push(row);
    }
  }

  // remote deletions → soft-delete
  for (const r of remote) {
    const existsLocally = local.some((l) => l.pb_id === r.id);
    if (!existsLocally && !r.isDeleted) {
      toSoftDelete.push(r.id);
    }
  }

  // optional preflight pull, but ONLY when there are no local deletions
  if (toSoftDelete.length === 0) {
    try {
      await runInitialSync({ silent: true });
    } catch (e) {
      console.warn("[SYNC] Silent preflight pull failed (continuing)", e);
    }
  }

  // conflict detection after optional preflight
  const lastSync = readLastSync();
  if (lastSync) {
    const conflicts = [];
    for (const row of searchAllQuestions("")) {
      // re-read in case of preflight
      const r =
        (row.pb_id && remoteById.get(row.pb_id)) || remoteByKey.get(mk(row));
      if (r && new Date(r.updated) > new Date(lastSync)) {
        const isBeingDeleted = toSoftDelete.includes(r.id);
        if (!isBeingDeleted) {
          conflicts.push({ id: row.id, pb_id: r.id, remoteUpdated: r.updated });
        }
      }
    }
    if (conflicts.length) return { ok: false, conflicts };
  }

  const s = (x) => (x ?? "").toString().trim();
  const toPBRecord = (row) => ({
    siteName: s(row.siteName),
    tag: s(row.tag),
    subtag: s(row.subtag),
    question: s(row.question),
    answer: s(row.answer),
    additionalInfo: s(row.additionalInfo),
    approved: row.approved === 1 || row.approved === true,
    isDeleted: false,
  });

  let created = 0,
    updated = 0,
    deleted = 0;

  // SOFT DELETE FIRST
  for (const id of toSoftDelete) {
    try {
      await pb.collection("questions").update(id, { isDeleted: true });
      deleted++;
    } catch (e) {
      console.error("Soft delete failed", id, e?.response?.data || e);
    }
  }

  // UPDATE
  for (const { targetId, row } of toUpdate) {
    try {
      const payload = toPBRecord(row);
      if (
        !payload.siteName ||
        !payload.tag ||
        !payload.subtag ||
        !payload.question ||
        !payload.answer
      ) {
        console.warn("Skip update due to required empties:", targetId, payload);
        continue;
      }
      await pb.collection("questions").update(targetId, payload);
      if (!row.pb_id && targetId) {
        try {
          attachPocketBaseId({ id: row.id, pb_id: targetId });
        } catch (e) {
          console.warn(
            "Failed to attach pb_id locally for",
            row.id,
            targetId,
            e
          );
        }
      }
      updated++;
    } catch (e) {
      console.error("Update failed", targetId, e?.response?.data || e);
    }
  }

  // CREATE
  for (const row of toCreate) {
    try {
      const payload = toPBRecord(row);
      if (
        !payload.siteName ||
        !payload.tag ||
        !payload.subtag ||
        !payload.question ||
        !payload.answer
      ) {
        console.warn("Skip create due to required empties:", row.id, payload);
        continue;
      }
      const rec = await pb.collection("questions").create(payload);
      created++;
      try {
        attachPocketBaseId({ id: row.id, pb_id: rec.id });
      } catch (e) {
        console.warn("Failed to attach pb_id locally for", row.id, rec.id, e);
      }
    } catch (e) {
      console.error("Create failed", row.id, e?.response?.data || e);
    }
  }

  // Postflight pull ALWAYS
  try {
    await runInitialSync({ silent: true });
  } catch (e) {
    console.warn("[SYNC] Silent postflight pull failed", e);
  }

  return { ok: true, created, updated, deleted };
});

// ---------------------------
// Diagnostics (optional but handy)
// ---------------------------

// Force-clear lastSync so next runInitialSync does a full pull
ipcMain.handle("sync.reset", async () => {
  try {
    if (fs.existsSync(syncMetaPath)) fs.unlinkSync(syncMetaPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// Test-create a PB question and surface raw error info (for debugging)
ipcMain.handle("pb.testCreate", async (_e, row) => {
  const pb = await pbEnsureLogin();
  const s = (x) => (x ?? "").toString().trim();
  const payload = {
    siteName: s(row.siteName),
    tag: s(row.tag),
    subtag: s(row.subtag),
    question: s(row.question),
    answer: s(row.answer),
    additionalInfo: s(row.additionalInfo),
    approved: row.approved === 1 || row.approved === true,
    isDeleted: false,
  };
  try {
    for (const k of ["siteName", "tag", "subtag", "question", "answer"]) {
      if (!payload[k]) return { ok: false, reason: `EMPTY_${k}`, payload };
    }
    const rec = await pb.collection("questions").create(payload);
    return {
      ok: true,
      recId: rec.id,
      authValid: !!pb.authStore?.isValid,
      baseUrl: pb.baseUrl,
    };
  } catch (err) {
    console.error(
      "pb.testCreate error:\n",
      util.inspect(err, { depth: 5, colors: true })
    );
    return {
      ok: false,
      message: err?.message,
      status: err?.status,
      url: err?.url,
      data: err?.response?.data,
      authValid: !!pb.authStore?.isValid,
      baseUrl: pb.baseUrl,
      payload,
    };
  }
});

// ADDED: debug create for questionnaire_archive using raw fetch (bypasses PB SDK)
ipcMain.handle("pb.debugArchiveCreate", async () => {
  const pb = await pbEnsureLogin();

  // pick ONE local archive row to test with
  const local = getAllArchiveEntries();
  const row = local.find((r) => r?.filePath && fs.existsSync(r.filePath));
  if (!row)
    return { ok: false, message: "No local archive PDF found to test." };

  const siteName = (row.siteName || "").trim();
  const year = Number(row.year || 0);
  const buf = fs.readFileSync(row.filePath);

  // IMPORTANT: use undici/web FormData
  const fd = new globalThis.FormData();
  fd.append("siteName", siteName);
  fd.append("year", String(year));
  fd.append(
    "files",
    new Blob([buf], { type: "application/pdf" }),
    path.basename(row.filePath)
  );

  const url = `${pb.baseUrl}/api/collections/questionnaire_archive/records`;

  const res = await fetch(url, {
    method: "POST",
    headers: pb.authStore?.token ? { Authorization: pb.authStore.token } : {},
    body: fd,
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  console.log("[pb.debugArchiveCreate] status:", res.status);
  console.log("[pb.debugArchiveCreate] body:", text);

  return { ok: res.ok, status: res.status, bodyText: text, bodyJson: json };
});

// ---------------------------
// Ephemeral session uploads
// ---------------------------
let sessionUploads = [];
ipcMain.handle("getSessionUploads", () => sessionUploads);
ipcMain.handle("addSessionUpload", (_e, row) => {
  sessionUploads.push(row);
  return true;
});
ipcMain.handle("clearSessionUploads", () => {
  sessionUploads = [];
  return true;
});

// ---------------------------
//
// Archive helpers (local)
//
// ---------------------------
function ensureArchiveDir() {
  const dir = path.join(app.getPath("userData"), "questionnaire_pdfs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function safeName(str) {
  return str.replace(/[^a-z0-9-_ ]/gi, "").trim();
}

function pbGetFilesList(rec) {
  return Array.isArray(rec.files)
    ? rec.files
    : typeof rec.files === "string" && rec.files
    ? [rec.files]
    : [];
}

// cache path includes pbId + stored filename, so multiple cached files can coexist
function pbCachePathFor(rec, storedFileName) {
  const dir = ensureArchiveDir();
  const cleanSite = safeName(rec.siteName || "Site");
  const year = Number(rec.year || 0) || 0;
  const pbId = rec.id || "unknown";
  const cleanFile = safeName(pbOriginalFileName(storedFileName) || "file");
  return path.join(dir, `${cleanSite}__${year}__${pbId}__${cleanFile}.pdf`);
}

async function ensurePbArchiveCached(pb, rec, requestedFileName) {
  const files = pbGetFilesList(rec);
  if (!files.length) throw new Error("PB record missing files field");

  const chosen =
    requestedFileName && files.includes(requestedFileName)
      ? requestedFileName
      : files[0];

  const dest = pbCachePathFor(rec, chosen);
  if (fs.existsSync(dest)) return dest;

  const url = pb.files.getUrl(rec, chosen);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PB download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());

  fs.writeFileSync(dest, buf);
  return dest;
}

// ---------------------------
// Browser window + IPC routes
// ---------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;

  // Sync state IPC
  ipcMain.handle("sync.getState", () => syncState);
  ipcMain.handle("sync.start", async () => {
    if (syncState.phase === "checking" || syncState.phase === "syncing")
      return syncState;
    runInitialSync();
    return syncState;
  });

  ipcMain.handle("sync.pull", async () => {
    await runInitialSync({ silent: false }); // show UI state messages
    return { ok: true };
  });

  // If you prefer to load a file in production, you can switch this later.
  // CHANGED: use dev server in dev, bundled HTML in packaged build
  if (app.isPackaged) {
    // In the asar, main.js lives in /electron, dist is alongside it
    const indexHtmlPath = path.join(__dirname, "..", "dist", "index.html"); // CHANGED
    const indexHtmlUrl = pathToFileURL(indexHtmlPath).href; // CHANGED
    win.loadURL(indexHtmlUrl); // CHANGED
  } else {
    win.loadURL("http://localhost:5173"); // unchanged for dev
  }

  // ---------- Auth ----------
  ipcMain.handle("login", async (_e, { username, password }) => {
    const localUser = loginUser({ username, password });

    // Always allow local credentials (offline-first).
    if (localUser) return localUser;

    try {
      const pb = getPB();

      await pb.collection("users").authWithPassword(username, password);

      if (!pb.authStore?.isValid) {
        return null;
      }

      // Persist PB creds so publish/sync can reuse without re-login prompts.
      config = { ...config, pbIdentity: username, pbPassword: password };
      fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");

      //Fallback: allow app login based on PB, even if SQLite doesn't have the user.
      return { username, role: "user", source: "pocketbase" };
    } catch (err) {
      console.error(
        "[login] failed:",
        err?.message,
        err?.status,
        err?.response?.data || ""
      );
      return null;
    }
  });

  // ---------- PocketBase: health/login/logout ----------
  ipcMain.handle("pb.health", async () => {
    try {
      const pb = getPB();
      await pb.collection("questions").getList(1, 1);
      return { ok: true, baseUrl: pb.baseUrl };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  // CHANGED: PB login persists creds so pbEnsureLogin can work later
  ipcMain.handle("pb.login", async (_e, { identity, password }) => {
    const pb = getPB();

    try {
      const res = await pb
        .collection("users")
        .authWithPassword(identity, password);

      const ok = !!pb.authStore?.isValid;
      console.log("[pb.login] ok?", ok, "user:", pb.authStore.model?.id);

      if (ok) {
        // persist for future pbEnsureLogin() calls
        config = { ...config, pbIdentity: identity, pbPassword: password };
        fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");
      }

      return { ok, model: res?.record || pb.authStore.model || null };
    } catch (err) {
      console.error(
        "[pb.login] failed:",
        err?.message,
        err?.status,
        err?.response?.data || ""
      );
      return {
        ok: false,
        message: err?.message || "PB login failed",
        status: err?.status,
        data: err?.response?.data,
      };
    }
  });

  // CHANGED: PB logout clears auth + stored creds
  ipcMain.handle("pb.logout", async () => {
    try {
      const pb = getPB();
      pb.authStore.clear();

      // clear saved creds
      config = { ...config, pbIdentity: "", pbPassword: "" };
      fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");

      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  // ---------- Search (approved only) ----------
  ipcMain.handle("getQuestions", async (_e, query) => {
    if (config.apiEndpoint === "local") {
      return searchApprovedQuestions(query);
    } else if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();
      const filter = [
        "approved = true",
        query
          ? `(question ~ "${query}" || answer ~ "${query}" || siteName ~ "${query}")`
          : null,
      ]
        .filter(Boolean)
        .join(" && ");
      const res = await pb.collection("questions").getList(1, 100, { filter });
      return res.items;
    } else {
      const url = `${
        config.apiEndpoint
      }/api/questions?approved=true&q=${encodeURIComponent(query || "")}`;
      const res = await fetch(url);
      return res.ok ? res.json() : [];
    }
  });

  // ---------- Maintenance ----------
  ipcMain.handle("maintenance.rebuildFTS", () => rebuildFTS());

  // ---------- Manage (all / approved / unapproved) ----------
  ipcMain.handle(
    "getManageQuestions",
    async (_e, { query = "", status = "all" }) => {
      if (config.apiEndpoint === "local") {
        switch (status) {
          case "approved":
            return searchApprovedQuestions(query);
          case "unapproved":
            return searchAllQuestions(query).filter((q) => q.approved === 0);
          default:
            return searchAllQuestions(query);
        }
      } else if (config.apiEndpoint === "pocketbase") {
        const pb = getPB();
        const parts = [];
        if (status === "approved") parts.push("approved = true");
        if (status === "unapproved") parts.push("approved = false");
        if (query)
          parts.push(
            `(question ~ "${query}" || answer ~ "${query}" || siteName ~ "${query}")`
          );
        const filter = parts.join(" && ") || "";
        const res = await pb
          .collection("questions")
          .getList(1, 200, { filter });
        return res.items;
      } else {
        const url = `${
          config.apiEndpoint
        }/api/manage?status=${status}&q=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        return res.ok ? res.json() : [];
      }
    }
  );

  // ---------- CRUD ----------
  ipcMain.handle("addQuestion", async (_e, payload) => {
    if (config.apiEndpoint === "local") {
      return addQuestion(payload);
    } else if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();
      const record = await pb.collection("questions").create({
        siteName: payload.siteName,
        tag: payload.tag,
        subtag: payload.subtag,
        question: payload.question,
        answer: payload.answer,
        additionalInfo: payload.additionalInfo ?? "",
        approved: !!payload.approved,
      });
      return record;
    } else {
      const res = await fetch(`${config.apiEndpoint}/api/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok ? res.json() : { error: "Failed" };
    }
  });

  ipcMain.handle("editQuestion", async (_e, payload) => {
    if (config.apiEndpoint === "local") {
      return editQuestion(payload);
    } else if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();
      await pb.collection("questions").update(payload.id, {
        siteName: payload.siteName,
        tag: payload.tag,
        subtag: payload.subtag,
        question: payload.question,
        answer: payload.answer,
        additionalInfo: payload.additionalInfo ?? "",
        approved:
          payload.approved !== undefined ? !!payload.approved : undefined,
      });
      return true;
    } else {
      await fetch(`${config.apiEndpoint}/api/questions/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return true;
    }
  });

  ipcMain.handle("removeQuestion", async (_e, id) => {
    if (config.apiEndpoint === "local") {
      return removeQuestion(id);
    } else if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();
      await pb.collection("questions").delete(id);
      // also try to remove vector row if present
      try {
        const existing = await pb
          .collection("qa_vectors")
          .getList(1, 1, { filter: `question="${id}"` });
        if (existing?.items?.length) {
          await pb.collection("qa_vectors").delete(existing.items[0].id);
        }
      } catch {
        /* ignore */
      }
      return true;
    } else {
      await fetch(`${config.apiEndpoint}/api/questions/${id}`, {
        method: "DELETE",
      });
      return true;
    }
  });

  ipcMain.handle("approveQuestion", async (_e, id) => {
    if (config.apiEndpoint === "local") {
      return approveQuestion(id);
    } else if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();
      await pb.collection("questions").update(id, { approved: true });
      return true;
    } else {
      await fetch(`${config.apiEndpoint}/api/questions/${id}/approve`, {
        method: "POST",
      });
      return true;
    }
  });

  // ---------- Similar (semantic or hybrid) ----------
  ipcMain.handle("findSimilarApproved", async (_e, { text, max = 5 }) => {
    if (config.apiEndpoint === "local") {
      return findSimilarApproved(text, max);
    } else if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();
      const filter = `(approved = true) && (question ~ "${text}" || answer ~ "${text}")`;
      const res = await pb.collection("questions").getList(1, max, { filter });
      return res.items;
    } else {
      const res = await fetch(
        `${config.apiEndpoint}/api/questions/similar?max=${max}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      return res.ok ? res.json() : [];
    }
  });

  // ---------- Archive ----------
  ipcMain.handle("getArchiveEntries", async () => {
    if (config.apiEndpoint === "local") {
      return getAllArchiveEntries();
    } else if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();

      // CHANGED: filter out soft-deleted records
      const res = await pb
        .collection("questionnaire_archive")
        .getFullList({ sort: "-created", filter: "isDeleted = false" });

      return res.map((r) => pbArchiveToUi(pb, r));
    } else {
      const res = await fetch(`${config.apiEndpoint}/api/archive`);
      return res.ok ? res.json() : [];
    }
  });

  // CHANGED: Publish local archive PDFs to PocketBase (append-only + dedupe)
  // - Uses FormData ONLY (more reliable for PB multi-file + modifiers)
  // - Dedupe by comparing local filename vs PB stored filenames (strip PB suffix)
  ipcMain.handle("archive.publish", async () => {
    const pb = await pbEnsureLogin();
    const baseUrl = pb.baseUrl;
    const token = pb.authStore?.token;

    const local = getAllArchiveEntries();

    let created = 0,
      updated = 0,
      skipped = 0,
      failed = 0;
    const errors = [];

    // Group local rows by siteName+year
    const groups = new Map(); // key -> { siteName, year, rows: [] }
    for (const row of local) {
      const siteName = (row.siteName || "").trim();
      const year = Number(row.year || 0);

      if (!siteName || !year || !row.filePath || !fs.existsSync(row.filePath)) {
        skipped++;
        continue;
      }

      const key = `${siteName}||${year}`;
      if (!groups.has(key)) groups.set(key, { siteName, year, rows: [] });
      groups.get(key).rows.push(row);
    }

    // Helper: PB REST create/update (multipart)
    async function pbCreateArchiveRecord({ siteName, year, filesToUpload }) {
      const fd = new globalThis.FormData();
      fd.append("siteName", siteName);
      fd.append("year", String(year));
      fd.append("isDeleted", "false");

      for (const r of filesToUpload) {
        const filename = path.basename(r.filePath);
        const buf = fs.readFileSync(r.filePath);
        fd.append(
          "files",
          new Blob([buf], { type: "application/pdf" }),
          filename
        );
      }

      const url = `${baseUrl}/api/collections/questionnaire_archive/records`;
      const res = await fetch(url, {
        method: "POST",
        headers: token ? { Authorization: token } : {},
        body: fd,
      });

      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}

      if (!res.ok) {
        const msg = json?.message || text || `Create failed (${res.status})`;
        const err = new Error(msg);
        err.status = res.status;
        err.pb = json;
        throw err;
      }
      return json;
    }

    async function pbPatchArchiveRecord(
      recId,
      { siteName, year, filesToAppend, revive }
    ) {
      const fd = new globalThis.FormData();
      fd.append("siteName", siteName);
      fd.append("year", String(year));
      if (revive) fd.append("isDeleted", "false");

      for (const r of filesToAppend) {
        const filename = path.basename(r.filePath);
        const buf = fs.readFileSync(r.filePath);
        // IMPORTANT: "files+" appends on PB
        fd.append(
          "files+",
          new Blob([buf], { type: "application/pdf" }),
          filename
        );
      }

      const url = `${baseUrl}/api/collections/questionnaire_archive/records/${recId}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: token ? { Authorization: token } : {},
        body: fd,
      });

      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}

      if (!res.ok) {
        const msg = json?.message || text || `Update failed (${res.status})`;
        const err = new Error(msg);
        err.status = res.status;
        err.pb = json;
        throw err;
      }
      return json;
    }

    for (const { siteName, year, rows } of groups.values()) {
      try {
        // Find existing PB record for same site+year
        const safeSite = siteName
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n");
        const filter = `siteName="${safeSite}" && year=${year}`;

        const existing = await pb
          .collection("questionnaire_archive")
          .getList(1, 1, { filter });

        // If no record exists, create it with ALL files in this group
        if (!existing?.items?.length) {
          await pbCreateArchiveRecord({ siteName, year, filesToUpload: rows });
          created++;
          continue;
        }

        const rec = existing.items[0];
        const recId = rec.id;

        const existingFiles = Array.isArray(rec.files)
          ? rec.files
          : typeof rec.files === "string" && rec.files
          ? [rec.files]
          : [];

        // Determine which local files are new (dedupe by name)
        const toAppend = rows.filter((r) => {
          const localName = path.basename(r.filePath);
          const already = existingFiles.some((pbName) =>
            sameFileName(localName, pbName)
          );
          return !already;
        });

        const revive = !!rec.isDeleted;

        if (toAppend.length === 0) {
          if (revive) {
            await pb
              .collection("questionnaire_archive")
              .update(recId, { isDeleted: false });
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        // Append all new files in ONE PATCH
        await pbPatchArchiveRecord(recId, {
          siteName,
          year,
          filesToAppend: toAppend,
          revive,
        });
        updated++;
      } catch (e) {
        failed++;
        errors.push({
          siteName,
          year,
          message: e?.message,
          status: e?.status,
          pb: e?.pb || e?.response?.data,
        });
        console.error("[archive.publish] group failed:", siteName, year, e);
      }
    }

    return { ok: failed === 0, created, updated, skipped, failed, errors };
  });

  ipcMain.handle("addArchiveEntry", async (_e, data) => {
    if (config.apiEndpoint === "local") {
      const dir = ensureArchiveDir();
      const clean = safeName(data.siteName);
      const baseName = data.filename
        ? path.parse(data.filename).name
        : `${clean}__${data.year}`;
      const finalName = `${baseName}.pdf`;
      const dest = path.join(dir, finalName);

      if (data.tempPath) {
        fs.copyFileSync(data.tempPath, dest);
      } else {
        fs.writeFileSync(dest, Buffer.from(data.buffer));
      }
      return insertArchiveEntry({
        siteName: clean,
        year: data.year,
        filePath: dest,
      });
    }

    if (config.apiEndpoint === "pocketbase") {
      const pb = await pbEnsureLogin();

      const siteName = (data.siteName || "").trim();
      const year = Number(data.year || 0);
      if (!siteName || !year)
        throw new Error("Missing siteName/year for PB archive upload.");

      const filename = data.filename || "archive.pdf";

      // Read bytes from tempPath or buffer
      let buf = null;
      if (data.tempPath && fs.existsSync(data.tempPath)) {
        buf = fs.readFileSync(data.tempPath);
      } else if (data.buffer) {
        buf = Buffer.from(data.buffer);
      } else {
        throw new Error("No PDF data provided (tempPath/buffer missing).");
      }

      // Prefer File payload (PB docs style)
      if (typeof globalThis.File === "function") {
        const file = new File([buf], filename, { type: "application/pdf" });

        const payload = {
          siteName,
          year,
          files: [file], // if Max Files > 1 use: files: [file]
        };

        const rec = await pb
          .collection("questionnaire_archive")
          .create(payload);
        return pbArchiveToUi(pb, rec);
      }

      // Fallback: FormData + Blob
      const formData = new globalThis.FormData();
      formData.append("siteName", siteName);
      formData.append("year", String(year));
      const blob = new Blob([buf], { type: "application/pdf" });
      formData.append("files", blob, filename);

      const rec = await pb.collection("questionnaire_archive").create(formData);
      return pbArchiveToUi(pb, rec);
    }

    return { error: "Remote archive upload not implemented yet" };
  });

  // CHANGED: allow opening PB-hosted PDFs too
  ipcMain.handle("openArchivePDF", async (_e, { id, filePath }) => {
    if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();
      const rec = await pb.collection("questionnaire_archive").getOne(id);
      const localPath = await ensurePbArchiveCached(pb, rec, fileName);
      await shell.openPath(localPath);
      return { ok: true };
    }
    // local behavior
    const full = fs.existsSync(filePath)
      ? filePath
      : path.join(app.getPath("userData"), filePath);
    if (!fs.existsSync(full)) throw new Error("File not found");
    shell.openPath(full);
    return true;
  });

  ipcMain.handle("getArchivePreviewUrl", async (_e, { id }) => {
    if (config.apiEndpoint === "local") {
      const row = getArchiveEntryById(id);
      if (!row || !row.filePath)
        throw new Error(`Archive entry ${id} not found`);
      if (!fs.existsSync(row.filePath))
        throw new Error(`File not found on disk: ${row.filePath}`);
      return { ok: true, href: pathToFileURL(row.filePath).href };
    }

    if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();
      const rec = await pb.collection("questionnaire_archive").getOne(id);
      const localPath = await ensurePbArchiveCached(pb, rec, fileName);
      return { ok: true, href: pathToFileURL(localPath).href };
    }

    throw new Error(
      "getArchivePreviewUrl not implemented for this apiEndpoint"
    );
  });

  // ADDED: delete an archive entry (local delete file + row; PB delete record)
  ipcMain.handle("removeArchiveEntry", async (_e, { id }) => {
    // ---------- LOCAL MODE ----------
    if (config.apiEndpoint === "local") {
      const row = getArchiveEntryById(id);
      if (!row) throw new Error(`Archive entry ${id} not found`);

      // delete local file
      try {
        if (row.filePath && fs.existsSync(row.filePath))
          fs.unlinkSync(row.filePath);
      } catch (e) {
        if (e.code !== "ENOENT")
          console.warn("[Archive] unlink failed:", row.filePath, e);
      }

      // delete local DB row
      deleteArchiveEntryById(id);

      // CHANGED: best-effort soft-delete on PB too (same way as Q/A behavior)
      // This is what makes "delete locally then publish later" still remove it from the server.
      try {
        const pb = await pbEnsureLogin();

        const siteName = (row.siteName || "")
          .trim()
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n");
        const year = Number(row.year || 0);

        if (siteName && year) {
          const filter = `siteName="${siteName}" && year=${year}`;
          const existing = await pb
            .collection("questionnaire_archive")
            .getList(1, 1, { filter });

          if (existing?.items?.length) {
            await pb
              .collection("questionnaire_archive")
              .update(existing.items[0].id, {
                isDeleted: true,
              });
          }
        }
      } catch (err) {
        // don't block local delete if PB is offline / not logged in
        console.warn("[Archive] PB soft-delete skipped:", err?.message || err);
      }

      return { ok: true };
    }

    // ---------- POCKETBASE MODE ----------
    if (config.apiEndpoint === "pocketbase") {
      const pb = await pbEnsureLogin();

      // CHANGED: soft delete instead of hard delete
      await pb
        .collection("questionnaire_archive")
        .update(id, { isDeleted: true });

      return { ok: true };
    }

    throw new Error("removeArchiveEntry not implemented for this apiEndpoint");
  });

  // ADDED: return a data: URL for the PDF (works even when file:// previews don't)
  ipcMain.handle("getArchivePreviewDataUrl", async (_e, { id }) => {
    if (config.apiEndpoint === "local") {
      const row = getArchiveEntryById(id);
      if (!row || !row.filePath)
        throw new Error(`Archive entry ${id} not found`);
      if (!fs.existsSync(row.filePath))
        throw new Error(`File not found: ${row.filePath}`);
      const buf = fs.readFileSync(row.filePath);
      const base64 = buf.toString("base64");
      return { ok: true, dataUrl: `data:application/pdf;base64,${base64}` };
    }

    if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();
      const rec = await pb.collection("questionnaire_archive").getOne(id);
      const localPath = await ensurePbArchiveCached(pb, rec, fileName);
      const buf = fs.readFileSync(localPath);
      return {
        ok: true,
        dataUrl: `data:application/pdf;base64,${buf.toString("base64")}`,
      };
    }

    throw new Error(
      "getArchivePreviewDataUrl not implemented for this apiEndpoint"
    );
  });

  // ADDED: download an archive entry to user-chosen path
  ipcMain.handle("downloadArchiveEntry", async (event, { id }) => {
    const win = event?.sender?.getOwnerBrowserWindow?.() || null;

    // Pre-read for filename
    let suggested = "questionnaire.pdf";
    let sourcePath = null;

    if (config.apiEndpoint === "local") {
      const row = getArchiveEntryById(id);
      if (!row || !row.filePath)
        throw new Error(`Archive entry ${id} not found or missing file`);
      sourcePath = row.filePath;
      suggested = path.basename(row.filePath) || suggested;
    }

    const { canceled, filePath: savePath } = await dialog.showSaveDialog(win, {
      title: "Save Questionnaire PDF",
      defaultPath: suggested,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !savePath) return { ok: false, canceled: true };

    if (config.apiEndpoint === "local") {
      if (!fs.existsSync(sourcePath))
        throw new Error(`Source file missing: ${sourcePath}`);
      fs.copyFileSync(sourcePath, savePath);
      try {
        shell.showItemInFolder(savePath);
      } catch {}
      return { ok: true, path: savePath };
    }

    if (config.apiEndpoint === "pocketbase") {
      const pb = getPB();
      const rec = await pb.collection("questionnaire_archive").getOne(id);

      const files = pbGetFilesList(rec);
      const chosen =
        typeof fileName === "string" && files.includes(fileName)
          ? fileName
          : files[0];
      if (!fileField) throw new Error("PB record missing files field");

      const fileUrl = pb.files.getUrl(rec, chosen);
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());

      fs.writeFileSync(savePath, buf);
      try {
        shell.showItemInFolder(savePath);
      } catch {}
      return { ok: true, path: savePath };
    }

    throw new Error(
      "downloadArchiveEntry not implemented for this apiEndpoint"
    );
  });

  // ---------- Vectors (PB only) ----------
  ipcMain.handle("pb.vectors.upsert", async (_e, { questionId, embedding }) => {
    const pb = getPB();
    const dim = Array.isArray(embedding) ? embedding.length : 0;
    const existing = await pb.collection("qa_vectors").getList(1, 1, {
      filter: `question="${questionId}"`,
    });
    if (existing?.items?.length) {
      return pb.collection("qa_vectors").update(existing.items[0].id, {
        embedding,
        dim,
      });
    }
    return pb.collection("qa_vectors").create({
      question: questionId,
      embedding,
      dim,
    });
  });

  // Fetch a single local record by id (used by Ask AI modal on click)
  ipcMain.handle("getQuestionById", (_e, id) => {
    const all = searchAllQuestions("");
    return all.find((r) => r.id === id) || null;
  });

  // ---------- AI Ask ----------
  ipcMain.handle("ai:ask", async (_e, args) => {
    try {
      const {
        query,
        k = 5,
        threshold = 0.55,
        useLLM = false,
        rewriteFrom = null, // explicit text to rewrite
      } = args ?? {};

      if (!query || !query.trim()) {
        return { error: true, message: "Empty query." };
      }

      // Call your semantic pipeline first
      const base = await askSemantic(query, k, threshold, useLLM);

      // Normalize expected shape
      let answer = base?.answer ?? "";
      const confidence = base?.confidence ?? null;
      let citations = Array.isArray(base?.citations)
        ? base.citations.slice(0, k)
        : [];

      // Ensure each citation has answer text (fill from local store if missing)
      if (citations.length) {
        const localAll = searchAllQuestions("");
        const byId = new Map(localAll.map((r) => [r.id, r]));
        citations = citations.map((c) => {
          const local = byId.get(c.id);
          return {
            ...c,
            question: c.question ?? local?.question ?? "",
            answer: c.answer ?? local?.answer ?? "",
            score: c.score ?? c.similarity ?? null,
          };
        });
      }

      // If LLM rewrite requested, prefer explicit 'rewriteFrom'; otherwise rewrite the base answer
      if (useLLM) {
        const text = (rewriteFrom && rewriteFrom.trim()) || answer;
        let rewritten = null;

        try {
          rewritten = await rewriteWithLLM(text);
        } catch (e) {
          console.warn(
            "[ai:ask] rewrite failed (LLM), will fallback:",
            e?.message || e
          );
        }

        // Fallback if LLM unavailable, errored, or produced virtually the same text
        if (!rewritten || normText(rewritten) === normText(text)) {
          rewritten = heuristicRewrite(text);
        }

        answer = rewritten;
      }

      return { error: false, answer, confidence, citations };
    } catch (err) {
      console.error("[ai:ask] failed:", err);
      return {
        error: true,
        message: "AI pipeline failed",
        details: String(err?.message || err),
      };
    }
  });

  // macOS: re-create window when dock icon is clicked and there are no other windows
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// ---------------------------
// App lifecycle
// ---------------------------
app.whenReady().then(() => {
  createWindow();
  // Fire-and-forget; renderer will poll 'sync.getState'
  runInitialSync();
});

app.on("before-quit", async () => {
  try {
    await shutdownLLM();
  } catch {
    /* ignore */
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
