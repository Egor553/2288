
/**
 * GOOGLE APPS SCRIPT BACKEND (V8)
 * Интеграция: Google Sheets <-> Mini App <-> Salebot
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const SLOTS_SHEET = SS.getSheetByName("Слоты") || SS.insertSheet("Слоты");
const BOOKINGS_SHEET = SS.getSheetByName("Записи") || SS.insertSheet("Записи");
const CLIENTS_SHEET = SS.getSheetByName("Клиенты") || SS.insertSheet("Клиенты");

// Инициализация заголовков
if (CLIENTS_SHEET.getLastRow() === 0) {
  CLIENTS_SHEET.appendRow(["external_id", "full_name", "phone", "city", "last_sync", "variables_json"]);
}
if (BOOKINGS_SHEET.getLastRow() === 0) {
  BOOKINGS_SHEET.appendRow(["timestamp", "type", "city", "slot", "full_name", "phone", "external_id", "status"]);
}

const SALEBOT_TOKEN = "b0dc696500931edf20f8395e7986fe02";
const SALEBOT_CALLBACK_URL = `https://chatter.salebot.pro/api/${SALEBOT_TOKEN}/callback`;

function doGet(e) {
  const action = e.parameter.action;
  const extId = e.parameter.external_id;

  if (action === "getSlots") {
    return createResponse({ slots: getSlotsData() });
  }

  if (action === "getUserData" && extId) {
    const client = getClientData(extId);
    const activeBooking = getActiveBooking(extId);
    return createResponse({ ...client, activeBooking });
  }
}

function doPost(e) {
  const action = e.parameter.action;
  const p = e.parameter;

  if (action === "createBooking") {
    const extId = p.external_id;
    BOOKINGS_SHEET.appendRow([new Date(), p.type, p.city, p.slot, p.full_name, "'" + p.phone, extId, "Active"]);
    const client = updateClientInSheet(extId, p.full_name, p.phone, p.city);
    
    // Отправляем в Salebot основные данные + переменные из таблицы
    sendToSalebot({
      client_id: extId,
      message: "mini_app_booking",
      name: p.full_name,
      phone: p.phone,
      city: p.city,
      booking_slot: p.slot,
      booking_status: "Created",
      client_variables: client.variables // Синхронизируем все переменные из ГТ
    });
    return createResponse({ success: true });
  }

  if (action === "cancelBooking") {
    const extId = p.external_id;
    const slotToReturn = p.slot_iso; 
    const cityName = p.city;

    const bookings = BOOKINGS_SHEET.getDataRange().getValues();
    for (let i = bookings.length - 1; i >= 1; i--) {
      if (bookings[i][6].toString() === extId.toString() && bookings[i][7] === "Active") {
        BOOKINGS_SHEET.getRange(i + 1, 8).setValue("Cancelled");
        break;
      }
    }

    const allSlots = getSlotsData();
    if (slotToReturn && cityName) {
      if (!allSlots[cityName]) allSlots[cityName] = [];
      if (!allSlots[cityName].includes(slotToReturn)) {
        allSlots[cityName].push(slotToReturn);
        saveSlotsToSheet(allSlots);
      }
    }

    sendToSalebot({
      client_id: extId,
      message: "mini_app_cancel",
      booking_status: "Cancelled"
    });

    return createResponse({ success: true });
  }

  if (action === "saveSlots") {
    saveSlotsToSheet(JSON.parse(p.slots));
    return createResponse({ success: true });
  }
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getSlotsData() {
  const raw = SLOTS_SHEET.getRange("A1").getValue();
  try { return raw ? JSON.parse(raw).slots : {}; } catch (e) { return {}; }
}

function saveSlotsToSheet(slots) {
  SLOTS_SHEET.getRange("A1").setValue(JSON.stringify({ slots: slots }));
}

function getActiveBooking(extId) {
  const data = BOOKINGS_SHEET.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][6].toString() === extId.toString() && data[i][7] === "Active") {
      return {
        type: data[i][1],
        city: data[i][2],
        slot: data[i][3],
        timestamp: data[i][0]
      };
    }
  }
  return null;
}

function getClientData(extId) {
  const data = CLIENTS_SHEET.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === extId.toString()) {
      return {
        exists: true,
        full_name: data[i][1],
        phone: data[i][2],
        city: data[i][3],
        variables: data[i][5] ? JSON.parse(data[i][5]) : {}
      };
    }
  }
  return { exists: false, variables: {} };
}

function updateClientInSheet(extId, name, phone, city) {
  const data = CLIENTS_SHEET.getDataRange().getValues();
  let rowIndex = -1;
  let currentVars = "{}";
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === extId.toString()) { 
      rowIndex = i + 1; 
      currentVars = data[i][5] || "{}";
      break; 
    }
  }
  if (rowIndex > 0) {
    CLIENTS_SHEET.getRange(rowIndex, 2, 1, 3).setValues([[name, phone, city]]);
    CLIENTS_SHEET.getRange(rowIndex, 5).setValue(new Date());
  } else {
    CLIENTS_SHEET.appendRow([extId, name, phone, city, new Date(), currentVars]);
  }
  return { variables: JSON.parse(currentVars) };
}

function sendToSalebot(payload) {
  try {
    UrlFetchApp.fetch(SALEBOT_CALLBACK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) { console.error(err); }
}
