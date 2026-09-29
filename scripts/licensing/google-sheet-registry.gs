/**
 * Webhook Google Apps Script — registre des installations CRM.
 * À coller dans Extensions → Apps Script du Google Sheet (hors dépôt).
 *
 * Propriété script : REGISTRY_TOKEN (Paramètres du projet → Propriétés du script)
 */

const HEADERS = [
  "installation_id",
  "client_email",
  "client_name",
  "cabinet",
  "license_type",
  "license_key",
  "status",
  "activated_at",
  "expires_at",
  "installed_at",
  "app_version",
  "os",
  "legacy",
  "last_event",
  "updated_at",
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const expected = PropertiesService.getScriptProperties().getProperty("REGISTRY_TOKEN");
    if (!expected || body.token !== expected) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const sheet = ensureSheet_();
    const installationId = String(body.installation_id || "").trim();
    if (!installationId) {
      return jsonResponse({ ok: false, error: "missing installation_id" }, 400);
    }

    const rowIndex = findRowByInstallationId_(sheet, installationId);
    const previous =
      rowIndex > 0 ? sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0] : null;
    const row = buildRow_(body, previous);
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    return jsonResponse({ ok: true, installation_id: installationId });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}

function ensureSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("installations");
  if (!sheet) {
    sheet = ss.insertSheet("installations");
  }
  ensureIdentityColumns_(sheet);
  return sheet;
}

/** Si une correction a retiré email / nom / cabinet, les réinsère après installation_id. */
function ensureIdentityColumns_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }
  const width = Math.max(sheet.getLastColumn(), 1);
  const header = sheet
    .getRange(1, 1, 1, width)
    .getValues()[0]
    .map(function (value) {
      return String(value || "").trim();
    });
  const identityMissing =
    header.indexOf("client_email") === -1 &&
    header.indexOf("client_name") === -1 &&
    header.indexOf("cabinet") === -1;
  if (identityMissing && header[0] === "installation_id" && header[1] === "license_type") {
    sheet.insertColumnsAfter(1, 3);
    sheet.getRange(1, 2, 1, 3).setValues([["client_email", "client_name", "cabinet"]]);
  }
}

function findRowByInstallationId_(sheet, installationId) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === installationId) {
      return i + 1;
    }
  }
  return -1;
}

function keepText_(incoming, previous) {
  const value = incoming == null ? "" : String(incoming).trim();
  if (value) return value;
  if (previous == null || previous === "") return "";
  return String(previous);
}

function buildRow_(body, previous) {
  const prev = previous || [];
  const now = new Date().toISOString();
  return [
    body.installation_id || prev[0] || "",
    keepText_(body.client_email, prev[1]),
    keepText_(body.client_name, prev[2]),
    keepText_(body.cabinet, prev[3]),
    body.license_type || prev[4] || "",
    keepText_(body.license_key, prev[5]),
    deriveStatus_(body),
    formatTs_(body.activated_at),
    formatTs_(body.expires_at),
    formatTs_(body.installed_at),
    body.app_version || "",
    body.os || "",
    body.legacy ? "oui" : "non",
    body.event || "",
    now,
  ];
}

function deriveStatus_(body) {
  if (body.license_type === "expired") return "expired";
  if (body.event === "test_ping") return "test";
  if (body.event === "trial_start") return "trial";
  if (body.license_type === "legacy") return "legacy";
  if (body.license_type === "lifetime") return "active";
  if (body.license_type === "annual") return "active";
  if (body.license_type === "trial") return "trial";
  return body.license_type || body.event || "unknown";
}

function formatTs_(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n * 1000).toISOString();
}

function jsonResponse(payload, code) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  // Apps Script ne permet pas de vrai code HTTP custom partout ; le corps suffit.
  return output;
}
