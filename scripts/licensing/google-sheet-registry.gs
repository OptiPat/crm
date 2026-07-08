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

    const row = buildRow_(body);
    const rowIndex = findRowByInstallationId_(sheet, installationId);
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
    sheet.appendRow(HEADERS);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
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

function buildRow_(body) {
  const now = new Date().toISOString();
  return [
    body.installation_id || "",
    body.client_email || "",
    body.client_name || "",
    body.cabinet || "",
    body.license_type || "",
    body.license_key || "",
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
