/**
 * Webhook Google Apps Script — notes partagées CRM.
 * À coller dans Extensions → Apps Script d'un Google Sheet dédié (hors dépôt).
 *
 * Propriété script : NOTES_REGISTRY_TOKEN
 */

const NOTES_HEADERS = [
  "id",
  "title",
  "content_html",
  "installation_id",
  "author_name",
  "created_at",
  "updated_at",
];

const CONTRIBUTION_HEADERS = [
  "id",
  "note_id",
  "installation_id",
  "author_name",
  "content_html",
  "created_at",
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const expected = PropertiesService.getScriptProperties().getProperty("NOTES_REGISTRY_TOKEN");
    if (!expected || body.token !== expected) {
      return jsonResponse({ ok: false, error: "unauthorized" });
    }

    const action = String(body.action || "").trim();
    switch (action) {
      case "sync":
        return handleSync_();
      case "create_note":
        return handleCreateNote_(body);
      case "update_note":
        return handleUpdateNote_(body);
      case "delete_note":
        return handleDeleteNote_(body);
      case "add_contribution":
        return handleAddContribution_(body);
      default:
        return jsonResponse({ ok: false, error: "unknown action" });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function handleSync_() {
  const notesSheet = ensureNotesSheet_();
  const contribSheet = ensureContributionsSheet_();
  const notes = readNotes_(notesSheet);
  const contributions = readContributions_(contribSheet);
  return jsonResponse({ ok: true, notes: notes, contributions: contributions });
}

function handleCreateNote_(body) {
  const sheet = ensureNotesSheet_();
  const installationId = String(body.installation_id || "").trim();
  const title = String(body.title || "").trim();
  if (!installationId || !title) {
    return jsonResponse({ ok: false, error: "missing fields" });
  }
  const now = Math.floor(Date.now() / 1000);
  const id = Utilities.getUuid();
  sheet.appendRow([
    id,
    title,
    String(body.content_html || ""),
    installationId,
    String(body.author_name || ""),
    now,
    now,
  ]);
  return jsonResponse({ ok: true, id: id });
}

function handleUpdateNote_(body) {
  const sheet = ensureNotesSheet_();
  const noteId = String(body.note_id || "").trim();
  const installationId = String(body.installation_id || "").trim();
  const rowIndex = findRowById_(sheet, noteId, 0);
  if (rowIndex < 0) {
    return jsonResponse({ ok: false, error: "note not found" });
  }
  const owner = String(sheet.getRange(rowIndex, 4).getValue() || "");
  if (owner !== installationId) {
    return jsonResponse({ ok: false, error: "forbidden" });
  }
  const now = Math.floor(Date.now() / 1000);
  sheet.getRange(rowIndex, 2).setValue(String(body.title || "").trim());
  sheet.getRange(rowIndex, 3).setValue(String(body.content_html || ""));
  sheet.getRange(rowIndex, 7).setValue(now);
  return jsonResponse({ ok: true });
}

function handleDeleteNote_(body) {
  const sheet = ensureNotesSheet_();
  const noteId = String(body.note_id || "").trim();
  const installationId = String(body.installation_id || "").trim();
  const rowIndex = findRowById_(sheet, noteId, 0);
  if (rowIndex < 0) {
    return jsonResponse({ ok: false, error: "note not found" });
  }
  const owner = String(sheet.getRange(rowIndex, 4).getValue() || "");
  if (owner !== installationId) {
    return jsonResponse({ ok: false, error: "forbidden" });
  }
  sheet.deleteRow(rowIndex);
  deleteContributionsForNote_(noteId);
  return jsonResponse({ ok: true });
}

function handleAddContribution_(body) {
  const noteId = String(body.note_id || "").trim();
  const installationId = String(body.installation_id || "").trim();
  const content = String(body.content_html || "").trim();
  if (!noteId || !installationId || !content) {
    return jsonResponse({ ok: false, error: "missing fields" });
  }
  const notesSheet = ensureNotesSheet_();
  if (findRowById_(notesSheet, noteId, 0) < 0) {
    return jsonResponse({ ok: false, error: "note not found" });
  }
  const sheet = ensureContributionsSheet_();
  const now = Math.floor(Date.now() / 1000);
  sheet.appendRow([
    Utilities.getUuid(),
    noteId,
    installationId,
    String(body.author_name || ""),
    content,
    now,
  ]);
  return jsonResponse({ ok: true });
}

function ensureNotesSheet_() {
  return ensureSheet_("shared_notes", NOTES_HEADERS);
}

function ensureContributionsSheet_() {
  return ensureSheet_("contributions", CONTRIBUTION_HEADERS);
}

function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

function readNotes_(sheet) {
  const values = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;
    rows.push({
      id: String(row[0]),
      title: String(row[1] || ""),
      content_html: String(row[2] || ""),
      installation_id: String(row[3] || ""),
      author_name: String(row[4] || ""),
      created_at: Number(row[5] || 0),
      updated_at: Number(row[6] || 0),
    });
  }
  return rows;
}

function readContributions_(sheet) {
  const values = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;
    rows.push({
      id: String(row[0]),
      note_id: String(row[1] || ""),
      installation_id: String(row[2] || ""),
      author_name: String(row[3] || ""),
      content_html: String(row[4] || ""),
      created_at: Number(row[5] || 0),
    });
  }
  return rows;
}

function findRowById_(sheet, id, colIndex) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][colIndex]) === id) {
      return i + 1;
    }
  }
  return -1;
}

function deleteContributionsForNote_(noteId) {
  const sheet = ensureContributionsSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][1]) === noteId) {
      sheet.deleteRow(i + 1);
    }
  }
}

function jsonResponse(payload) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
