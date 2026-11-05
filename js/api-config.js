// ============================================================
//  ตั้งค่า API Backend URL (Google Apps Script Web App URL)
// ============================================================

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxAIOUHJn-bjjLnfU65GOtTzgAz1PpY0NgCvM2DMJwbLZne4WCsHu-eyypJSUlsOC7I/exec';

// บังคับอัปเดตแคชในเบราว์เซอร์อัตโนมัติ เพื่อไม่ให้ค้างค่า URL เก่า
if (typeof localStorage !== 'undefined') {
  localStorage.setItem('gasApiUrl', GAS_API_URL);
}
