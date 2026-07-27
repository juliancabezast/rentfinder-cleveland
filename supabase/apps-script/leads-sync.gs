// Rent Finder Cleveland — Leads sync (Google Apps Script Web App)
//
// SETUP (one time, ~5 min):
//   1. Open the sheet "Rent Finder Cleveland — Leads (Live)".
//   2. Extensions → Apps Script. Delete whatever is there and paste THIS whole file.
//   3. Change SECRET below to your own value (give the SAME value to Claude).
//   4. Deploy → New deployment → select type "Web app":
//         Execute as:      Me
//         Who has access:  Anyone
//   5. Authorize when prompted, then copy the Web app URL that ends in /exec.
//   6. Send Claude that /exec URL + your SECRET. Done — leads flow in automatically.
//
// The script is column-agnostic: it writes whatever headers/rows the backend
// sends, so adding columns later needs no change here.

var SHEET_NAME = "Leads";
var SECRET = "CHANGE_ME"; // ← put your own secret here (any hard-to-guess string)

// Resolve the target tab: prefer "Leads"; otherwise adopt the first tab and
// rename it, so everything lives in one place whether the sheet was pre-created
// (with a preview) or is brand new.
function getSheet_(ss) {
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName(SHEET_NAME);
  }
  return sh;
}

function writeHeaders_(sh, headers) {
  if (headers.length > 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!SECRET || body.secret !== SECRET) {
      return jsonOut({ ok: false, error: "unauthorized" });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = getSheet_(ss);
    var headers = body.headers || [];
    var mode = body.mode;

    if (mode === "full") {
      sh.clear();
      writeHeaders_(sh, headers);
      var rows = body.rows || [];
      if (rows.length > 0) {
        sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }
      return jsonOut({ ok: true, mode: "full", count: rows.length });
    }

    if (mode === "append") {
      var arows = body.rows || [];
      if (sh.getLastRow() === 0) writeHeaders_(sh, headers);
      if (arows.length > 0) {
        var start = sh.getLastRow() + 1;
        sh.getRange(start, 1, arows.length, headers.length).setValues(arows);
      }
      return jsonOut({ ok: true, mode: "append", count: arows.length });
    }

    if (mode === "upsert") {
      var row = body.row || [];
      if (sh.getLastRow() === 0) writeHeaders_(sh, headers);
      var last = sh.getLastRow();
      var target = -1;
      if (last >= 2) {
        var ids = sh.getRange(2, 1, last - 1, 1).getValues();
        for (var i = 0; i < ids.length; i++) {
          if (String(ids[i][0]) === String(row[0])) {
            target = i + 2;
            break;
          }
        }
      }
      var at = target > 0 ? target : (sh.getLastRow() + 1);
      sh.getRange(at, 1, 1, row.length).setValues([row]);
      return jsonOut({ ok: true, mode: "upsert", row: at });
    }

    return jsonOut({ ok: false, error: "unknown_mode" });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
