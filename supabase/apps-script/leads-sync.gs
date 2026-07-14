// Rent Finder Cleveland - Leads sync
// Pega TODO este archivo en Apps Script (reemplaza lo que haya).
// Cambia el valor de SECRET por una clave tuya (la misma que le pases a Claude).

var SHEET_NAME = "Leads";
var SECRET = "CAMBIA_ESTE_SECRETO";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!SECRET || body.secret !== SECRET) {
      return jsonOut({ ok: false, error: "unauthorized" });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(SHEET_NAME);
    }
    var headers = body.headers || [];
    var mode = body.mode;

    if (mode === "full") {
      sh.clear();
      if (headers.length > 0) {
        sh.getRange(1, 1, 1, headers.length).setValues([headers]);
        sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
        sh.setFrozenRows(1);
      }
      var rows = body.rows || [];
      if (rows.length > 0) {
        sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }
      return jsonOut({ ok: true, mode: "full", count: rows.length });
    }

    if (mode === "append") {
      var arows = body.rows || [];
      if (arows.length > 0) {
        var start = sh.getLastRow() + 1;
        sh.getRange(start, 1, arows.length, headers.length).setValues(arows);
      }
      return jsonOut({ ok: true, mode: "append", count: arows.length });
    }

    if (mode === "upsert") {
      var row = body.row || [];
      if (sh.getLastRow() === 0 && headers.length > 0) {
        sh.getRange(1, 1, 1, headers.length).setValues([headers]);
        sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
        sh.setFrozenRows(1);
      }
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
