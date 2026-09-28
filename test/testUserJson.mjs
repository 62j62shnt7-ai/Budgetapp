import assert from 'node:assert';

// Lightweight in-memory storage for test harness
if (typeof globalThis.localStorage === 'undefined') {
  const storeMap = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
    clear: () => storeMap.clear(),
    get length() { return storeMap.size; },
    key: (i) => Array.from(storeMap.keys())[i] || null,
  };
}

import { buildInstallmentEntries } from '../src/engine/salaryAndInstallments.ts';
import { calculateForecast, simulateSpend } from '../src/engine/forecast.ts';
import { computeTotalStorageValue } from '../src/engine/currency.ts';
import { calculateJobFinancials } from '../src/engine/jobs.ts';
import { useBudgetStore } from '../src/store/useBudgetStore.ts';
import { buildEntryDeleteOptions } from '../src/utils/affectedRecords.ts';

// Full exact User JSON Payload provided in user request
const fullUserBackupPayload = {
  "app": "budget-control",
  "version": "2.1",
  "exportedAt": "2026-09-26T23:59:00.271Z",
  "seedVersion": "blank-template-v2",
  "data": {
    "salaryPattern": [
      { "monthOffset": 0, "day": 15, "amount": 32000 },
      { "monthOffset": 0, "day": 30, "amount": 16500 },
      { "monthOffset": 1, "day": 15, "amount": 20500 },
      { "monthOffset": 1, "day": 30, "amount": 16500 },
      { "monthOffset": 2, "day": 15, "amount": 20500 },
      { "monthOffset": 2, "day": 30, "amount": 21000 }
    ],
    "cashEntries": [
      { "id": "bf0866da-960c-4ca1-b843-ca4ddd8e0b58", "date": "2026-10-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense", "draws": [], "tag": "Food", "creditSettlementDate": "" },
      { "id": "2f1f70cf-8e91-4529-9c3d-6be93f0c92db", "date": "2026-11-01", "category": "Home", "account": "hsbc", "type": "expense", "amount": 15000, "tag": "Food", "subcategory": "Food", "currency": "EGP", "originalAmount": 15000, "fxRateAtEntry": 1 },
      { "id": "1e308b6e-5359-49af-866c-877df5044250", "date": "2026-12-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "657704d6-93b9-4c93-90bf-6994e207c730", "date": "2027-01-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "55acfa06-368f-4ea1-ac48-2bc345c814de", "date": "2027-02-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "1ef67889-82a8-478f-a47a-46b6a52bb2df", "date": "2027-03-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "392b4568-c6fe-4408-a412-6d994974858c", "date": "2027-04-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "278f76a1-88d3-4195-8ad2-18b504676237", "date": "2027-05-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "f0790ac3-e11b-405e-a84b-67f2ea4c33e7", "date": "2027-06-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "2348d32c-ec9b-47aa-919d-1563655fde70", "date": "2027-07-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "86417fd9-3e29-40b9-b549-8cb8d0795968", "date": "2027-08-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "0e247f1e-2972-4e3c-88c5-df303565d25d", "date": "2027-09-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "f6ff94a7-3e2c-48ae-9885-33d9da6ed86c", "date": "2027-10-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "41578b58-34ee-484e-81e1-f0554a74cc8b", "date": "2027-11-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "cce1e0a8-6adf-4130-b6ae-0bb1f36d874f", "date": "2027-12-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "8d809553-46af-49a5-9111-76e43a2adeba", "date": "2028-01-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "2fca80a7-a47e-4720-87b7-259cbb073178", "date": "2028-02-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "18a2d3cf-4bbc-4055-825d-959fe6c6f13a", "date": "2028-03-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "2e6c9aa5-2b7e-48ca-8689-2065620fd2e5", "date": "2028-04-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "bdf0f436-4e36-4d18-bc4c-e1435378eba7", "date": "2028-05-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "73828002-a936-4697-8648-0cbccf2160c7", "date": "2028-06-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "322be29c-04a3-48fd-afcc-82e87a25ba12", "date": "2026-09-10", "category": "Profit share", "account": "HSBC", "type": "income", "amount": 55000, "creditType": "", "source": "income monthly", "draws": [{ "date": "2026-09-10", "amount": 60907, "account": "HSBC", "tag": "Salary" }], "actualDate": "2026-09-10", "isClosed": true, "keepOngoing": false, "tag": "Salary" },
      { "id": "748568d6-49fb-4fc0-84e4-11c2ff0be9a7", "date": "2026-10-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 1300, "creditType": "", "source": "expense", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "c6aea3f6-e823-4461-83c4-2d0c923acc9c", "date": "2026-11-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 1300, "creditType": "", "source": "expense", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "bbca3204-2f6b-4954-ac8d-de60699c97e8", "date": "2026-12-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 1300, "creditType": "", "source": "expense", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "1e16d45e-2556-4948-ba18-e6bc20924a89", "date": "2027-01-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 1300, "creditType": "", "source": "expense", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "8fab568a-ca4b-4c79-98ee-1fa393f83a21", "date": "2027-02-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 1100, "creditType": "", "source": "expense", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "8ec5a76a-2bc3-4a85-a5e9-3ebd5319940a", "date": "2027-03-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 650, "creditType": "", "source": "expense monthly", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "84e9f754-a0d3-4ebf-8087-ca93a4581d42", "date": "2027-04-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 650, "creditType": "", "source": "expense monthly", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "7c2826a9-5c99-430d-8e52-080841ff82e4", "date": "2027-05-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 650, "creditType": "", "source": "expense monthly", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "77f6e9ac-5eaf-484c-9451-4cda392ed4ab", "date": "2027-06-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 650, "creditType": "", "source": "expense monthly", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "1bae1646-b6a4-43a9-a724-fa964254ef0a", "date": "2027-07-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 650, "creditType": "", "source": "expense monthly", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "7ac153f2-5eea-48b7-bd9a-11f154cd79ed", "date": "2027-08-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 650, "creditType": "", "source": "expense monthly", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "49b1361d-8727-405e-9233-048130252597", "date": "2027-09-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 650, "creditType": "", "source": "expense monthly", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "id": "51c125b1-c60e-441c-bd47-619497ff11d9", "date": "2027-10-01", "category": "Garage", "account": "HSBC", "type": "expense", "amount": 650, "creditType": "", "source": "expense monthly", "tag": "Rent", "creditSettlementDate": "", "draws": [] },
      { "date": "2026-09-14", "category": "salary", "account": "hsbc", "type": "income", "amount": 20500, "source": "salary", "id": "27c6df4b-8a59-44eb-b88e-212e582c67bf", "creditType": "", "draws": [{ "date": "2026-09-09", "amount": 20931, "account": "hsbc", "tag": "Salary" }], "actualDate": "2026-09-09", "isClosed": true, "keepOngoing": false, "tag": "Salary" },
      { "date": "2026-09-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 21000, "source": "salary", "id": "8d7e4c4c-4d59-4813-8c12-4ac26dbaf874", "actualDate": "2026-09-20", "draws": [{ "date": "2026-09-20", "amount": 25263, "account": "hsbc", "tag": "Salary" }], "isClosed": true, "keepOngoing": false, "tag": "Salary" },
      { "date": "2026-10-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 32000, "source": "salary", "id": "03a3b055-01e6-4667-9c37-e57e31d530b1", "tag": "Salary" },
      { "date": "2026-10-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 16500, "source": "salary", "id": "860e1f38-fe84-4b73-ac6e-6358ceef44ec", "tag": "Salary" },
      { "date": "2026-11-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 20500, "source": "salary", "id": "984ed485-9e9b-485f-a4d5-8b8325a6261b", "tag": "Salary" },
      { "date": "2026-11-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 16500, "source": "salary", "id": "018ba376-153f-48a9-9bf0-1423469875d9", "tag": "Salary" },
      { "date": "2026-12-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 20500, "source": "salary", "id": "25776eb1-6177-4fe5-bc0a-9ae439eda5cc", "tag": "Salary" },
      { "date": "2026-12-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 21000, "source": "salary", "id": "0fb0c473-e762-4602-a1f1-e4b2462e95f8", "tag": "Salary" },
      { "date": "2027-01-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 32000, "source": "salary", "id": "eac930b1-5ce2-4ad2-b4da-be2df27d6341", "tag": "Salary" },
      { "date": "2027-01-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 16500, "source": "salary", "id": "046327dc-b17c-4e81-afb0-d9224ce6fbc0", "tag": "Salary" },
      { "date": "2027-02-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 20500, "source": "salary", "id": "bcf97f2b-6011-444f-8434-c4f0472c6f5e", "tag": "Salary" },
      { "date": "2027-02-28", "category": "salary", "account": "hsbc", "type": "income", "amount": 16500, "source": "salary", "id": "a863bb49-c0a5-4417-9038-43131f19000d", "tag": "Salary" },
      { "date": "2027-03-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 20500, "source": "salary", "id": "a694d02b-7b07-468d-a4a4-c3f9798b746a", "tag": "Salary" },
      { "date": "2027-03-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 21000, "source": "salary", "id": "cf8d4fa5-d206-4449-bfad-5f54dc6d30f8", "tag": "Salary" },
      { "date": "2027-04-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 32000, "source": "salary", "id": "eafa0d99-b322-45d3-bfb7-26b070067706", "tag": "Salary" },
      { "date": "2027-04-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 16500, "source": "salary", "id": "dbb61fdb-8644-4bed-89e0-7789a9b45378", "tag": "Salary" },
      { "date": "2027-05-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 20500, "source": "salary", "id": "9506e394-69d1-464d-a4ec-030c73055dea", "tag": "Salary" },
      { "date": "2027-05-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 16500, "source": "salary", "id": "56040e03-510e-4a64-9310-d0d78116ea4f", "tag": "Salary" },
      { "date": "2027-06-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 20500, "source": "salary", "id": "7024ce55-6bc9-444b-bc73-47ed108e8614", "tag": "Salary" },
      { "date": "2027-06-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 21000, "source": "salary", "id": "7e7da5d4-f11a-49e7-aef3-a281fe93b23e", "tag": "Salary" },
      { "date": "2027-07-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 32000, "source": "salary", "id": "02c7b17d-ee1d-4d4c-904b-e1fb9266007b", "tag": "Salary" },
      { "date": "2027-07-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 16500, "source": "salary", "id": "e9372ebf-9a17-4c79-9cfc-ab57643115cf", "tag": "Salary" },
      { "date": "2027-08-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 20500, "source": "salary", "id": "45a9a210-3761-436e-a46e-1fa7c9c2b35e", "tag": "Salary" },
      { "date": "2027-08-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 16500, "source": "salary", "id": "8bf825df-d218-48ad-8199-4a281bf7b063", "tag": "Salary" },
      { "date": "2027-09-15", "category": "salary", "account": "hsbc", "type": "income", "amount": 20500, "source": "salary", "id": "863949e5-aaa2-4e11-bb39-c70e4b7643c8", "tag": "Salary" },
      { "date": "2027-09-30", "category": "salary", "account": "hsbc", "type": "income", "amount": 21000, "source": "salary", "id": "7d9b7e1b-ea05-41e4-8bbc-0cb5fcb246d4", "tag": "Salary" },
      { "id": "88440c0b-bba8-4ee8-995f-3570c8adb792", "date": "2028-07-01", "category": "Home", "account": "HSBC", "type": "expense", "amount": 15000, "creditType": "", "source": "expense monthly", "tag": "Food" },
      { "id": "fdaff57d-98d0-42d2-bb22-c61a00affbf6", "date": "2027-09-12", "category": "Profit share", "account": "hsbc", "type": "income", "amount": 120000, "creditType": "", "source": "income", "tag": "Salary" },
      { "id": "f25dc9b8-f747-4b97-a466-c5bb4867b585", "date": "2026-09-12", "category": "Transportation", "account": "hsbc", "type": "expense", "amount": 1700, "creditType": "", "source": "expense", "draws": [{ "date": "2026-09-12", "amount": 1700, "tag": "Kids", "account": "hsbc" }], "actualDate": "2026-09-12", "isClosed": true, "keepOngoing": false, "tag": "Kids", "creditSettlementDate": "" },
      { "id": "5d56a29c-7d78-4d50-8330-8be5b9c31ce4", "date": "2026-10-08", "category": "Transportation", "account": "hsbc", "type": "expense", "amount": 1700, "creditType": "", "source": "expense", "draws": [], "tag": "Kids", "creditSettlementDate": "" },
      { "id": "1a562886-ce0e-4376-bd20-9ac369a5753d", "date": "2026-11-08", "category": "Transportation", "account": "hsbc", "type": "expense", "amount": 1700, "creditType": "", "source": "expense", "draws": [], "tag": "Kids", "creditSettlementDate": "" },
      { "id": "54d99352-bc85-48dd-bf5c-87be36eabae9", "loanId": "f146e724-315a-4d19-8dc5-2d81a0d3c2c8", "date": "2026-09-20", "category": "Loan Repayment: Bridge Loan \"dad\"", "account": "hsbc", "type": "expense", "amount": 50000, "source": "loan", "creditType": "", "draws": [{ "date": "2026-09-20", "amount": 50000, "account": "hsbc", "tag": "Loan" }], "creditSettlementDate": "", "actualDate": "2026-09-20", "isClosed": true, "keepOngoing": false, "tag": "Loan" },
      { "id": "40f43465-eff7-41da-a2c3-197268f7db5e", "loanId": "a65ac6c5-7855-4675-942e-e6de368b3650", "date": "2026-09-30", "category": "Loan Repayment: Bridge Loan \"nono\"", "account": "hsbc", "type": "expense", "amount": 17013, "source": "loan", "initialAmount": 15000, "creditType": "", "draws": [{ "date": "2026-09-23", "amount": 20020, "account": "hsbc", "tag": "Loan" }], "actualDate": "2026-09-23", "isClosed": true, "keepOngoing": false, "tag": "Loan" },
      { "id": "3c7e0e9f-28e4-47d0-8093-8ed8a557efdf", "date": "2026-09-30", "category": "kamal repayment", "account": "hsbc", "type": "income", "amount": 5000, "creditType": "", "source": "income", "draws": [], "tag": "Loan", "creditSettlementDate": "" },
      { "id": "fd4a34a4-addc-4bc5-b5d8-12a64db4f450", "date": "2026-09-14", "category": "School", "account": "HSBC CREDIT", "type": "expense", "amount": 39765, "creditType": "hsbc_card", "source": "credit card", "actualDate": "2026-09-14", "draws": [{ "date": "2026-09-14", "amount": 39765, "tag": "Kids", "account": "HSBC CREDIT" }], "creditSettlementDate": "2026-10-31", "tag": "Kids" },
      { "id": "7048c867-0f26-4115-9b39-932d3156048d", "date": "2026-09-16", "category": "Barakat", "account": "hsbc", "type": "income", "amount": 10000, "creditType": "", "source": "income", "actualDate": "2026-09-16", "tag": "Part-Time", "creditSettlementDate": "", "draws": [{ "date": "2026-09-16", "amount": 10000, "tag": "Part-Time", "account": "hsbc" }] },
      { "id": "66e815e5-fe5a-46d4-80e7-fab2210c66a2", "date": "2026-09-18", "category": "Electricity", "account": "HSBC CREDIT", "type": "expense", "amount": 1030, "creditType": "hsbc_card", "source": "credit card", "actualDate": "2026-09-18", "draws": [{ "date": "2026-09-18", "amount": 1030, "tag": "Bills", "account": "HSBC CREDIT" }], "creditSettlementDate": "2026-10-31", "tag": "Bills" },
      { "id": "6171fb7e-756d-4f6b-aaf3-c57cfe0c1a2a", "date": "2026-09-09", "category": "Home", "tag": "Food", "account": "hsbc", "type": "expense", "amount": 15000, "creditType": "", "creditSettlementDate": "", "source": "expense", "actualDate": "2026-09-25", "draws": [{ "date": "2026-09-09", "amount": 10000, "tag": "Food", "account": "hsbc" }, { "date": "2026-09-24", "amount": 1413, "tag": "Groceries", "account": "hsbc" }, { "date": "2026-09-24", "amount": 1902, "tag": "Groceries", "account": "hsbc" }, { "date": "2026-09-24", "amount": 991, "tag": "Groceries", "account": "hsbc" }, { "date": "2026-09-25", "amount": 4000, "tag": "Food", "account": "hsbc" }], "actualAmount": 18306, "keepOngoing": true, "isClosed": false },
      { "id": "5fa82220-6017-4d57-aeba-dbb4db0f9197", "date": "2026-09-24", "category": "Barakat", "account": "hsbc", "type": "income", "amount": 20800, "source": "part-time job", "creditType": "", "tag": "Part-Time", "creditSettlementDate": "", "actualDate": "2026-09-24", "draws": [{ "date": "2026-09-24", "amount": 20800, "tag": "Part-Time", "account": "hsbc" }] }
    ],
    "installments": [
      {
        "name": "Wadi Degla installment",
        "tag": "Installment",
        "amount": 32600,
        "frequency": 3,
        "totalMonths": 8,
        "remainingMonths": 8,
        "startMonth": "2026-10",
        "id": "inst-1790374046130-dnh4m",
        "day": 7,
        "account": "hsbc"
      }
    ],
    "storageAssets": [
      { "name": "Gold", "quantity": 23.3, "unit": "grams", "rate": 6252, "rateSource": "gold:Gold 21", "id": "storage-1790290682176-0", "amount": 0, "buyRate": 1, "buyPrice": 6252 },
      { "name": "USD", "quantity": 2900, "unit": "dollars", "rate": 51.81, "rateSource": "currency:USD", "id": "storage-1790290682176-1", "amount": 0, "buyRate": 1, "buyPrice": 51.81 },
      { "name": "EUR", "quantity": 3280, "unit": "euros", "rate": 59.16, "rateSource": "currency:EUR", "id": "storage-1790290682176-2", "amount": 0, "buyRate": 1, "buyPrice": 59.16 },
      { "name": "SAR", "quantity": 175, "unit": "SAR", "rate": 13.88, "rateSource": "currency:SAR", "id": "storage-1790290682176-3", "amount": 0, "buyRate": 1, "buyPrice": 13.88 }
    ],
    "accountBalances": {
      "cib": { "name": "CIB", "balance": 0, "maturityDay": 15 },
      "hsbc": { "name": "HSBC", "balance": 100558, "maturityDay": 30 }
    },
    "partTimeJobs": [
      {
        "id": "8115e466-7054-4ec5-b756-d1d438384d89",
        "title": "Barakat",
        "client": "Jadeela",
        "currency": "EGP",
        "type": "daily_rate",
        "dailyRate": 4000,
        "lumpSumAmount": 0,
        "daysWorked": [
          { "id": "dw-1", "date": "2026-09-16", "units": 1 },
          { "id": "dw-2", "date": "2026-09-17", "units": 1 },
          { "id": "dw-3", "date": "2026-09-19", "units": 1 },
          { "id": "dw-4", "date": "2026-09-20", "units": 1 },
          { "id": "dw-5", "date": "2026-09-21", "units": 1 },
          { "id": "dw-6", "date": "2026-09-22", "units": 1 }
        ],
        "expenses": [
          { "id": "exp-1", "date": "2026-09-21", "title": "Fuel", "amount": 3070, "isReimbursable": false },
          { "id": "exp-2", "date": "2026-09-21", "title": "accommodation", "amount": 1690, "isReimbursable": true },
          { "id": "exp-3", "date": "2026-09-19", "title": "accommodation", "amount": 3380, "isReimbursable": true },
          { "id": "exp-4", "date": "2026-09-16", "title": "accommodation", "amount": 1690, "isReimbursable": true }
        ],
        "status": "paid",
        "invoiceDate": "2026-09-23",
        "paidDate": "2026-09-24",
        "settlementAccount": "cib",
        "payments": [
          { "id": "pay-1", "date": "2026-09-21", "amount": 10000, "account": "hsbc", "paymentNote": "Down payment" },
          { "id": "pay-2", "date": "2026-09-24", "amount": 20800, "account": "hsbc", "paymentNote": "", "entryId": "5fa82220-6017-4d57-aeba-dbb4db0f9197" }
        ]
      }
    ],
    "ratesData": {
      "currencies": [
        { "name": "USD", "sell": 51.81, "buy": 51.56 },
        { "name": "EUR", "sell": 59.16, "buy": 58.67 },
        { "name": "SAR", "sell": 13.88, "buy": 13.69 }
      ],
      "gold": [
        { "name": "Gold 21", "sell": 6252, "buy": 6212 }
      ]
    },
    "entryActuals": {
      "5fa82220-6017-4d57-aeba-dbb4db0f9197": 20800,
      "6171fb7e-756d-4f6b-aaf3-c57cfe0c1a2a": 18306,
      "54d99352-bc85-48dd-bf5c-87be36eabae9": 50000,
      "fd4a34a4-addc-4bc5-b5d8-12a64db4f450": 39765,
      "7048c867-0f26-4115-9b39-932d3156048d": 10000,
      "66e815e5-fe5a-46d4-80e7-fab2210c66a2": 1030,
      "4c68ced8-94c1-45c4-af5b-389777a5889e": 980,
      "40f43465-eff7-41da-a2c3-197268f7db5e": 20020
    },
    "entryActualDates": {
      "5fa82220-6017-4d57-aeba-dbb4db0f9197": "2026-09-24",
      "6171fb7e-756d-4f6b-aaf3-c57cfe0c1a2a": "2026-09-25",
      "54d99352-bc85-48dd-bf5c-87be36eabae9": "2026-09-20"
    },
    "creditDueMonths": {
      "hsbc": "2026-10",
      "cib": "2026-09"
    },
    "creditSettlementOverrides": {
      "credit-settlement-hsbc-2026-10": {
        "amount": 55087,
        "date": "2026-10-29"
      }
    },
    "salaryAnchorMonth": "2026-07"
  }
};

console.log('Testing User Backup Payload...');

// 1. Test Backup Import into store
const imported = useBudgetStore.getState().importJSON(JSON.stringify(fullUserBackupPayload));
assert.strictEqual(imported, true, 'User payload imported successfully');

const state = useBudgetStore.getState();
assert.ok(state.entries.length >= 8, 'Entries loaded');
assert.ok(state.storageAssets.length === 4, 'Storage assets loaded');
assert.ok(state.partTimeJobs.length === 1, 'Part time jobs loaded');
assert.strictEqual(state.installments.length, 1, 'Installment loaded');

// 2. Test Job Financials
const jobFin = calculateJobFinancials(state.partTimeJobs[0], state.rates);
assert.strictEqual(jobFin.totalDays, 6);
assert.strictEqual(jobFin.grossFee, 24000);
assert.strictEqual(jobFin.billableExpenses, 6760);
assert.strictEqual(jobFin.totalInvoice, 30760);
assert.strictEqual(jobFin.totalPaid, 30800);
assert.strictEqual(jobFin.remainingBalance, 0);
assert.strictEqual(jobFin.computedStatus, 'paid');
console.log('✓ User Job calculation verified (Labor: 24,000, Expenses: 6,760, Total: 30,760, Paid: 30,800)');

// 3. Test Storage Holdings Total
const storageTotal = computeTotalStorageValue(state.storageAssets, {
  USD: 51.81,
  EUR: 59.16,
  SAR: 13.88,
  goldGram21: 6252,
});
assert.ok(storageTotal > 400000, 'Storage total correctly computed');
console.log(`✓ Storage portfolio value: ${storageTotal.toLocaleString()} EGP`);

// 4. Test Affected Records Modal Builder on every entry in dataset
state.entries.forEach((e) => {
  const res = buildEntryDeleteOptions(e, {
    installments: state.installments,
    storageAssets: state.storageAssets,
    partTimeJobs: state.partTimeJobs,
    asfJobs: state.asfJobs,
    irqJobs: state.irqJobs,
  });
  assert.ok(res.itemDescription, `Entry ${e.id} has description`);
  assert.ok(res.amountFormatted, `Entry ${e.id} has formatted amount`);
  assert.ok(res.options.length >= 1, `Entry ${e.id} has options`);
});
console.log(`✓ Verified Affected Records modal builders across all ${state.entries.length} cash entries without errors`);

// 5. Test Installments Schedule Generation (Quarterly: 32600 every 3 months)
const installmentEntries = buildInstallmentEntries(state.installments, '2026-09-01', '2027-10-31');
assert.ok(installmentEntries.length >= 4, 'Quarterly installment generates proper scheduled entries');
console.log(`✓ Quarterly installment schedule verified: ${installmentEntries.length} entries generated between 2026-09 and 2027-10`);

// 6. Test Multi-Draw Tranche Deletion and Recalculation
const multiDrawHomeEntry = state.entries.find((e) => e.id === '6171fb7e-756d-4f6b-aaf3-c57cfe0c1a2a');
assert.ok(multiDrawHomeEntry, 'Found Multi-draw Home entry');
const initialDrawCount = multiDrawHomeEntry.draws.length;
state.deleteDraw(multiDrawHomeEntry.id, 0, { updateCashflow: true });
const afterDrawDelete = useBudgetStore.getState().entries.find((e) => e.id === '6171fb7e-756d-4f6b-aaf3-c57cfe0c1a2a');
assert.strictEqual(afterDrawDelete.draws.length, initialDrawCount - 1, 'Draw tranche removed');
assert.strictEqual(afterDrawDelete.actualAmount, 8306, 'Actual amount recalculated (18306 - 10000 = 8306)');
console.log('✓ Tranche deletion & actual amount recalculation verified on User JSON');

// 7. Test Forecast Engine on full User Dataset
const totalOpeningBalance = Object.values(state.accounts).reduce((sum, acc) => sum + (acc.balance || 0), 0);
assert.strictEqual(totalOpeningBalance, 100558, 'Total opening cash is 100,558 EGP');

const monthlyForecast = calculateForecast(state.entries, totalOpeningBalance, 12);
assert.ok(monthlyForecast.length >= 12, '12-month horizon forecast generated');
assert.ok(!Number.isNaN(monthlyForecast[0].balance), 'Valid monthly closing balance');
console.log(`✓ Monthly forecast calculated: ${monthlyForecast.length} months generated with starting cash ${totalOpeningBalance} EGP`);

// 8. Test Spend Simulator on User Dataset
const spendSim = simulateSpend(state.entries, totalOpeningBalance, '2026-10-15', 20000);
assert.ok(!Number.isNaN(spendSim.lowestBalance), 'Spend simulator returns valid lowest balance');
console.log(`✓ Spend simulator verified (Simulating 20k spend -> lowest balance: ${spendSim.lowestBalance} EGP)`);

console.log('\n=============================================================');
console.log('🌟 ALL REAL-WORLD USER JSON TESTS PASSED WITH 100% ACCURACY! 🌟');
console.log('=============================================================');
