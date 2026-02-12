// Snapshot of data schema as of v1.0.0
// This file is used to test backward compatibility.
// If future versions change the schema, the app must still be able to load this data.

const DATA_V1_SNAPSHOT = {
    factory_rawMaterials: JSON.stringify([
        {
            "id": "rm_1",
            "supplier": "Tamartushka",
            "receiveDate": "2024-01-01",
            "category": "Spices",
            "item": "Test Spice",
            "weight": "10",
            "unit": "kg"
        }
    ]),
    factory_dateReceiving: JSON.stringify([
        {
            "id": "dr_1",
            "supplier": "Gamliel",
            "receiveDate": "2024-01-02",
            "weight": "500",
            "tithing": true
        }
    ]),
    factory_users: JSON.stringify([
        {
            "username": "legacy_admin",
            "password": "123",
            "role": "admin",
            "name": "Legacy Admin",
            "nameHe": "מנהל ותיק"
        }
    ]),
    factory_session: JSON.stringify({
        "username": "legacy_admin",
        "role": "admin",
        "name": "Legacy Admin"
    })
};

// Function to inject this data
function injectLegacyData() {
    console.log("Injecting Legacy Data (v1)...");
    localStorage.clear();
    Object.keys(DATA_V1_SNAPSHOT).forEach(key => {
        localStorage.setItem(key, DATA_V1_SNAPSHOT[key]);
    });
}
