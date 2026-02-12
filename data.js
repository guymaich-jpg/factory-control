// ============================================================
// data.js — LocalStorage Data Layer
// ============================================================

const STORE_KEYS = {
  rawMaterials: 'factory_rawMaterials',
  dateReceiving: 'factory_dateReceiving',
  fermentation: 'factory_fermentation',
  distillation1: 'factory_distillation1',
  distillation2: 'factory_distillation2',
  bottling: 'factory_bottling',
};

function getData(key) {
  return JSON.parse(localStorage.getItem(key) || '[]');
}

function setData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function addRecord(key, record) {
  const data = getData(key);
  record.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  record.createdAt = new Date().toISOString();
  record.createdBy = getSession()?.username || 'unknown';
  data.unshift(record);
  setData(key, data);
  return record;
}

function updateRecord(key, id, updates) {
  const data = getData(key);
  const idx = data.findIndex(r => r.id === id);
  if (idx !== -1) {
    data[idx] = { ...data[idx], ...updates, updatedAt: new Date().toISOString() };
    setData(key, data);
    return data[idx];
  }
  return null;
}

function deleteRecord(key, id) {
  const data = getData(key);
  const filtered = data.filter(r => r.id !== id);
  setData(key, filtered);
}

function getRecordCount(key) {
  return getData(key).length;
}

function getTodayRecords(key) {
  const today = new Date().toISOString().slice(0, 10);
  return getData(key).filter(r => r.createdAt && r.createdAt.startsWith(today));
}

// ---------- Dropdown option data ----------
const SUPPLIERS_RAW = [
  'sup_tamartushka', 'sup_nichuchot', 'sup_iherb',
  'sup_shlr', 'sup_pcsi', 'sup_yakev', 'sup_selfHarvest', 'sup_other'
];

const SUPPLIERS_DATES = [
  'sup_gamliel', 'sup_lara', 'sup_selfHarvest', 'sup_other'
];

const CATEGORIES = ['rm_cat_spices', 'rm_cat_labels', 'rm_cat_packaging'];

const ITEMS_BY_CATEGORY = {
  rm_cat_spices: [
    'Anise Seeds / เมล็ดโป๊ยกั๊ก',
    'Star Anise / โป๊ยกั๊ก',
    'Licorice / ชะเอม',
    'Juniper / จูนิเปอร์',
    'Cardamom / กระวาน',
    'Cinnamon / อบเชย',
    'Chamomile / คาโมมายล์',
    'Coriander Seeds / เมล็ดผักชี',
    'Citrus Orange / ส้ม',
    'Citrus Lemon / มะนาว',
    'Jujube / พุทรา',
    'Carob / แคร็อบ',
    'Pennyroyal / เพนนีรอยัล',
    'Allspice / ออลสไปซ์',
    'Katlav / คัทลาฟ',
    'Mastic / มาสติก',
    'Terebinth / เทเรบินท์',
  ],
  rm_cat_labels: [
    'Arak Neck / ฉลากคออารัก',
    'Arak Body / ฉลากตัวอารัก',
    'Gin Neck / ฉลากคอจิน',
    'Gin Body / ฉลากตัวจิน',
    'EDV Neck / ฉลากคอ EDV',
    'EDV Body / ฉลากตัว EDV',
    'Licorice Neck / ฉลากคอชะเอม',
    'Licorice Body / ฉลากตัวชะเอม',
    'Brandy VS Neck / ฉลากคอบรั่นดี VS',
    'Brandy VS Body / ฉลากตัวบรั่นดี VS',
    'Brandy VSOP Neck / ฉลากคอบรั่นดี VSOP',
    'Brandy VSOP Body / ฉลากตัวบรั่นดี VSOP',
    'Cork Label Copper / ฉลากจุกทองแดง',
    'Cork Label Gold / ฉลากจุกทอง',
  ],
  rm_cat_packaging: [
    'Obulo Bottle (Brandy) / ขวดโอบูโล (บรั่นดี)',
    'Demos Bottle (Gin, EDV) / ขวดเดมอส (จิน, EDV)',
    'Lov Bottle (Arak, Licorice) / ขวดลอฟ (อารัก, ชะเอม)',
    'Demos Cork / จุกเดมอส',
    'Obulo/Lov Cork / จุกโอบูโล/ลอฟ',
    'Carton 6-Obulo / กล่อง 6 โอบูโล',
    'Carton 6-Demos / กล่อง 6 เดมอส',
    'Carton 6-Lov / กล่อง 6 ลอฟ',
    'Carton Single / กล่องเดี่ยว',
    'Carton 12-Obulo / กล่อง 12 โอบูโล',
    'Carton 12-Demos / กล่อง 12 เดมอส',
    'Carton 12-Lov / กล่อง 12 ลอฟ',
    'Barrels / ถังไม้โอ๊ค',
  ],
};

const TANK_SIZES = [400, 500, 900, 1000];

const DRINK_TYPES = [
  'drink_arak', 'drink_gin', 'drink_edv', 'drink_licorice',
  'drink_brandyVS', 'drink_brandyVSOP', 'drink_brandyMed'
];

const D1_TYPES = [
  'd1_type_dist1', 'd1_type_tailsArak', 'd1_type_tailsGin',
  'd1_type_tailsEDV', 'd1_type_cleaning'
];

const STILL_NAMES = ['d1_still_amiti', 'd1_still_aladdin'];

const D2_PRODUCT_TYPES = ['drink_edv', 'drink_arak', 'drink_gin'];

// ---------- CSV Export ----------
function exportToCSV(key, filename) {
  const data = getData(key);
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      let val = row[h] ?? '';
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(','))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename || (key + '.csv');
  link.click();
}

function exportAllData() {
  const keys = [
    'factory_rawMaterials',
    'factory_dateReceiving',
    'factory_fermentation',
    'factory_distillation1',
    'factory_distillation2',
    'factory_bottling',
    'factory_inventory',
    'factory_users'
  ];

  const today = new Date().toISOString().slice(0, 10);

  keys.forEach(key => {
    // Only verify data exists before export
    if (localStorage.getItem(key)) {
      exportToCSV(key, key + '_' + today + '.csv');
    }
  });
}
