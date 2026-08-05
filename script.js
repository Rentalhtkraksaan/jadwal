const firebaseConfig = {
    apiKey: "AIzaSyBiNwS8pU3D6iF5gTmM95kzMIy-tm_sTIY",
    authDomain: "rentalhtkraksaan-61397.firebaseapp.com",
    databaseURL: "https://rentalhtkraksaan-61397-default-rtdb.firebaseio.com",
    projectId: "rentalhtkraksaan-61397",
    storageBucket: "rentalhtkraksaan-61397.appspot.com",
    messagingSenderId: "665290802617",
    appId: "1:665290802617:web:efb004f474218e443fa268"
};

const app = firebase.initializeApp(firebaseConfig);
const db = app.database();
const auth = app.auth();

const TRANSAKSI_PATH = 'keuangan/transaksi';
const SALDO_PATH = 'keuangan/saldo'; 
const transaksiRef = db.ref(TRANSAKSI_PATH);
const saldoRef = db.ref(SALDO_PATH); 

let allTransactionsData = {}; 
let allSaldoData = {}; 
let keuanganChart;
let currentParsedList = [];

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const AKUN_SALDO = {
    'CASH': 'Cash',
    'LEMARI': 'Di Lemari', 
    'BNI': 'BNI',
    'DANA': 'DANA',
    'GOPAY': 'GOPAY'
};

// --- INISIALISASI ---
auth.signInAnonymously()
    .then(() => {
        console.log("✅ Login anonim berhasil");
        populateMonthFilter();
        listenForTransactions();
        listenForSaldo(); 
        document.getElementById('tanggal').value = getTodayDateString();
    })
    .catch((error) => {
        console.error("❌ Login anonim gagal:", error.message);
        alert("Gagal terhubung ke database. Cek konsol.");
    });


// --- SMART QUICK INPUT PARSER (SINGLE & MULTI-LINE) ---

function parseSingleQuickLine(line) {
    line = line.trim();
    if (!line) return null;

    let jenis = 'PENGELUARAN';
    let rawText = line;

    if (rawText.startsWith('+')) {
        jenis = 'PEMASUKAN';
        rawText = rawText.substring(1).trim();
    } else if (rawText.startsWith('-')) {
        jenis = 'PENGELUARAN';
        rawText = rawText.substring(1).trim();
    } else {
        const lowerLine = rawText.toLowerCase();
        if (/^\b(masuk|pemasukan|in)\b/.test(lowerLine)) {
            jenis = 'PEMASUKAN';
            rawText = rawText.replace(/^\b(masuk|pemasukan|in)\b/i, '').trim();
        } else if (/^\b(keluar|pengeluaran|out)\b/.test(lowerLine)) {
            jenis = 'PENGELUARAN';
            rawText = rawText.replace(/^\b(keluar|pengeluaran|out)\b/i, '').trim();
        }
    }

    let lower = rawText.toLowerCase();
    let metode = 'CASH';
    let subMetode = 'CASH';

    if (/\b(bni)\b/.test(lower)) {
        subMetode = 'BNI';
        metode = 'TF';
    } else if (/\b(dana)\b/.test(lower)) {
        subMetode = 'DANA';
        metode = 'TF';
    } else if (/\b(gopay)\b/.test(lower)) {
        subMetode = 'GOPAY';
        metode = 'TF';
    } else if (/\b(lemari)\b/.test(lower)) {
        subMetode = 'LEMARI';
        metode = 'CASH';
    }

    if (/\bqris\b/.test(lower)) {
        metode = 'QRIS';
        if (subMetode === 'CASH') subMetode = 'DANA';
    } else if (/\b(cash|tunai)\b/.test(lower)) {
        metode = 'CASH';
        subMetode = 'CASH';
    } else if (/\b(tf|transfer)\b/.test(lower)) {
        metode = 'TF';
        if (subMetode === 'CASH') subMetode = 'BNI';
    }

    const words = rawText.split(/\s+/);
    let nominal = 0;
    let nominalIndex = -1;

    for (let i = words.length - 1; i >= 0; i--) {
        let w = words[i].toLowerCase().replace(/^rp\.?/, '');
        const match = w.match(/^(\d+(?:[\.,]\d+)?)(k|rb|ribu|jt|juta)?$/);
        if (match) {
            let numStr = match[1];
            let unit = match[2];

            if (numStr.includes('.') || numStr.includes(',')) {
                if (unit) {
                    numStr = numStr.replace(',', '.');
                } else {
                    numStr = numStr.replace(/[\.,]/g, '');
                }
            }

            let val = parseFloat(numStr);
            if (!isNaN(val) && val > 0) {
                if (unit) {
                    if (['k', 'rb', 'ribu'].includes(unit)) val *= 1000;
                    else if (['jt', 'juta'].includes(unit)) val *= 1000000;
                } else {
                    if (val < 1000) {
                        val *= 1000;
                    }
                }
                nominal = val;
                nominalIndex = i;
                break;
            }
        }
    }

    let nameWords = words.filter((w, idx) => {
        if (idx === nominalIndex) return false;
        const wLower = w.toLowerCase().replace(/^rp\.?/, '');
        if (['cash', 'tunai', 'tf', 'transfer', 'qris', 'bni', 'dana', 'gopay', 'lemari', 'masuk', 'pemasukan', 'keluar', 'pengeluaran'].includes(wLower)) return false;
        return true;
    });

    let nama = nameWords.join(' ').trim();
    if (!nama) nama = 'Transaksi Auto Input';

    return {
        originalText: line,
        jenis,
        metode,
        subMetode,
        nama,
        nominal
    };
}

function handleQuickInput() {
    const textVal = document.getElementById('quickInput').value;
    const previewContainer = document.getElementById('quickPreview');
    const previewListElem = document.getElementById('quickPreviewList');
    const quickCountElem = document.getElementById('quickCount');

    if (!textVal.trim()) {
        previewContainer.style.display = 'none';
        currentParsedList = [];
        return;
    }

    const lines = textVal.split('\n');
    currentParsedList = [];

    lines.forEach(line => {
        const parsed = parseSingleQuickLine(line);
        if (parsed) {
            currentParsedList.push(parsed);
        }
    });

    if (currentParsedList.length === 0) {
        previewContainer.style.display = 'none';
        return;
    }

    previewContainer.style.display = 'block';
    quickCountElem.textContent = currentParsedList.length;

    previewListElem.innerHTML = '';
    currentParsedList.forEach((item, index) => {
        const isPemasukan = item.jenis === 'PEMASUKAN';
        const badgeClass = isPemasukan ? 'badge badge-pemasukan' : 'badge badge-pengeluaran';
        const badgeText = isPemasukan ? '<i class="fa-solid fa-circle-arrow-down"></i> PEMASUKAN' : '<i class="fa-solid fa-circle-arrow-up"></i> PENGELUARAN';
        const nominalClass = isPemasukan ? 'text-pemasukan' : 'text-pengeluaran';
        const subText = (item.metode !== 'CASH' && item.subMetode) ? ` (${item.subMetode})` : '';

        const itemDiv = document.createElement('div');
        itemDiv.className = 'quick-preview-item';
        itemDiv.innerHTML = `
            <div class="quick-item-badge"><span class="${badgeClass}">${badgeText}</span></div>
            <div class="quick-item-info">
                <strong>${item.nama}</strong>
                <span class="badge badge-metode" style="font-size:0.7rem; margin-left:4px;">${item.metode}${subText}</span>
            </div>
            <div class="quick-item-nominal">
                <strong class="${nominalClass}">${formatRupiah(item.nominal)}</strong>
            </div>
        `;
        previewListElem.appendChild(itemDiv);
    });

    const submitBtn = document.getElementById('btnQuickSubmit');
    if (currentParsedList.length === 1) {
        submitBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> Simpan 1 Transaksi Otomatis (Enter)`;
        
        // Auto fill manual form if 1 item
        const first = currentParsedList[0];
        setJenis(first.jenis, 'form');
        document.getElementById('nama').value = first.nama;
        document.getElementById('metode').value = first.metode;
        toggleSubMetode();
        if (first.metode !== 'CASH' && ['BNI', 'DANA', 'GOPAY'].includes(first.subMetode)) {
            document.getElementById('subMetode').value = first.subMetode;
        }
        if (first.nominal > 0) {
            document.getElementById('nominal').value = first.nominal;
        }
    } else {
        submitBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> Simpan ${currentParsedList.length} Transaksi Sekaligus`;
    }
}

function handleQuickKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        if (!document.getElementById('quickInput').value.includes('\n')) {
            event.preventDefault();
            submitQuickInput();
        }
    }
}

async function submitQuickInput() {
    if (!currentParsedList || currentParsedList.length === 0) {
        alert("Ketik transaksi terlebih dahulu. Contoh: +arang 15kg cash 225");
        return;
    }

    const validItems = currentParsedList.filter(item => item.nominal > 0);
    if (validItems.length === 0) {
        alert("Nominal transaksi belum ditemukan atau 0. Contoh: +arang 15kg cash 225");
        return;
    }

    try {
        for (const item of validItems) {
            let akunKey = item.metode === 'CASH' ? 'CASH' : item.subMetode;
            if (!akunKey || (akunKey === 'CASH' && item.metode !== 'CASH')) {
                akunKey = 'BNI';
            }

            const operation = item.jenis === 'PEMASUKAN' ? 'add' : 'subtract';

            await updateSaldo(akunKey, item.nominal, operation);

            const now = firebase.database.ServerValue.TIMESTAMP;
            const data = {
                tanggal: getTodayDateString(),
                jenis: item.jenis,
                metode: item.metode,
                subMetode: akunKey,
                nama: item.nama,
                nominal: item.nominal,
                timestamp: now,
                lastUpdated: now
            };

            await transaksiRef.push(data);
        }

        console.log(`Berhasil menambahkan ${validItems.length} transaksi!`);
        document.getElementById('quickInput').value = '';
        document.getElementById('quickPreview').style.display = 'none';
        currentParsedList = [];
        document.getElementById('transaksiForm').reset();
        setJenis('PEMASUKAN', 'form');
        document.getElementById('subMetodeContainer').style.display = 'none';
        document.getElementById('tanggal').value = getTodayDateString();

        alert(`✅ Berhasil menambahkan ${validItems.length} transaksi ke database!`);
    } catch (error) {
        console.error("Gagal menambahkan transaksi quick input:", error);
        alert("Terjadi kesalahan saat menyimpan transaksi: " + error.message);
    }
}


// --- UTILITY & VIEW FUNCTIONS ---

function setJenis(value, context) {
    if (context === 'form') {
        document.getElementById('jenis').value = value;
        const btnIn = document.getElementById('formBtnPemasukan');
        const btnOut = document.getElementById('formBtnPengeluaran');
        if (value === 'PEMASUKAN') {
            btnIn.classList.add('active-pemasukan');
            btnOut.classList.remove('active-pengeluaran');
        } else {
            btnIn.classList.remove('active-pemasukan');
            btnOut.classList.add('active-pengeluaran');
        }
    } else if (context === 'edit') {
        document.getElementById('editJenis').value = value;
        const btnIn = document.getElementById('editBtnPemasukan');
        const btnOut = document.getElementById('editBtnPengeluaran');
        if (value === 'PEMASUKAN') {
            btnIn.classList.add('active-pemasukan');
            btnOut.classList.remove('active-pengeluaran');
        } else {
            btnIn.classList.remove('active-pemasukan');
            btnOut.classList.add('active-pengeluaran');
        }
    }
}

function formatRupiah(angka) {
    return 'Rp ' + Math.abs(angka).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function getTodayDateString() {
    const today = new Date();
    return today.toISOString().substring(0, 10);
}

function getCurrentMonthYearString() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    return `${currentYear}-${currentMonth}`;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function populateMonthFilter() {
    const selectRingkasan = document.getElementById('filter-periode-ringkasan');
    const startYear = 2025;
    const endYear = 2026;
    
    const optionsRingkasan = [
        { value: 'ALL', text: 'Semua Data' }, 
        { value: 'DAILY', text: 'Hari Ini' }
    ];

    optionsRingkasan.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        selectRingkasan.appendChild(option);
    });
    
    for (let year = startYear; year <= endYear; year++) {
        for (let i = 0; i < 12; i++) {
            if (year === startYear && i < 10) continue; 
            
            const value = `${year}-${String(i + 1).padStart(2, '0')}`; 
            const text = `${MONTH_NAMES[i]} ${year}`;
            
            const optionRingkasan = document.createElement('option');
            optionRingkasan.value = value;
            optionRingkasan.textContent = text;
            selectRingkasan.appendChild(optionRingkasan);
        }
    }
    
    selectRingkasan.value = 'ALL';
}

function toggleSubMetode() {
    const metode = document.getElementById('metode').value;
    const container = document.getElementById('subMetodeContainer');
    
    if (metode === 'TF' || metode === 'QRIS') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function toggleEditSubMetode(metodeValue) {
    const container = document.getElementById('editSubMetodeContainer');
    const metode = metodeValue || document.getElementById('editMetode').value;
    
    if (metode === 'TF' || metode === 'QRIS') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}


// --- SALDO MANAGEMENT FUNCTIONS ---

function listenForSaldo() {
    saldoRef.on('value', (snapshot) => {
        allSaldoData = snapshot.val() || {};
        initializeSaldoAccounts();
        renderSaldoTable();
    }, (error) => {
        console.error("Error membaca data Saldo Firebase:", error);
    });
}

function initializeSaldoAccounts() {
    let updates = {};
    for (const key in AKUN_SALDO) {
        if (!allSaldoData[key]) {
            updates[key] = {
                nama: AKUN_SALDO[key],
                saldo: 0
            };
        }
    }
    if (Object.keys(updates).length > 0) {
        saldoRef.update(updates)
            .then(() => console.log("Saldo akun default diinisialisasi."))
            .catch(error => console.error("Gagal inisialisasi saldo:", error));
    }
}

function updateSaldo(akunKey, nominal, operation) {
    return new Promise((resolve, reject) => {
        if (!nominal || isNaN(nominal) || nominal <= 0) {
            console.error("Nominal tidak valid.");
            return reject(new Error("Nominal tidak valid."));
        }
        
        const currentRef = saldoRef.child(akunKey).child('saldo');
        currentRef.transaction((currentSaldo) => {
            if (currentSaldo === null) {
                currentSaldo = 0; 
            }
            
            let newSaldo;
            if (operation === 'add') {
                newSaldo = currentSaldo + nominal;
            } else if (operation === 'subtract') {
                newSaldo = currentSaldo - nominal;
            } else {
                return; 
            }

            return newSaldo; 
        }, (error, committed, snapshot) => {
            if (error) {
                console.error(`Gagal update saldo ${akunKey}:`, error);
                reject(error);
            } else if (!committed) {
                console.warn(`Transaksi saldo ${akunKey} dibatalkan.`);
                resolve();
            } else {
                resolve(snapshot.val());
            }
        });
    });
}

function handleManualEditSaldo(akunKey) {
    const nominalString = prompt(`Masukkan nilai Saldo AKHIR baru untuk ${AKUN_SALDO[akunKey]} (contoh: 500000):`);
    if (nominalString === null) return; 
    
    const newSaldo = parseFloat(nominalString);
    if (!isNaN(newSaldo) && newSaldo >= 0) {
        saldoRef.child(akunKey).update({
            saldo: newSaldo
        })
        .then(() => {
            alert(`Saldo ${AKUN_SALDO[akunKey]} berhasil diperbarui menjadi ${formatRupiah(newSaldo)}.`);
            console.log(`Saldo ${akunKey} di-set ke ${newSaldo}`);
        })
        .catch(error => {
            alert(`Gagal memperbarui saldo: ${error.message}`);
            console.error("Gagal set saldo:", error);
        });
    } else {
        alert("Input saldo tidak valid atau nominal harus >= 0.");
    }
}


function renderSaldoTable() {
    const tbody = document.getElementById('saldoTableBody');
    tbody.innerHTML = '';
    
    const orderedKeys = ['CASH', 'LEMARI', 'BNI', 'DANA', 'GOPAY'];

    orderedKeys.forEach(key => {
        if (allSaldoData[key]) {
            const data = allSaldoData[key];
            const row = tbody.insertRow();
            
            const akunCell = row.insertCell();
            akunCell.innerHTML = `<span class="akun-badge"><i class="fa-solid fa-wallet"></i> ${data.nama}</span>`;
            
            const saldoCell = row.insertCell();
            saldoCell.innerHTML = `<strong class="text-primary">${formatRupiah(data.saldo)}</strong>`;
            
            const aksiCell = row.insertCell();
            aksiCell.className = "text-center";
            aksiCell.innerHTML = `
                <button class="aksi-button edit-btn" onclick="handleManualEditSaldo('${key}')"><i class="fa-solid fa-pen"></i> Edit</button>
            `;
        }
    });
}

// --- CRUD LOGIC FOR MANUAL FORM ---

document.getElementById('transaksiForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const jenis = document.getElementById('jenis').value;
    const metode = document.getElementById('metode').value;
    const subMetode = document.getElementById('subMetode').value;
    const nominal = parseFloat(document.getElementById('nominal').value);
    
    let akunKey;
    if (metode === 'CASH') {
        akunKey = 'CASH';
    } else if (metode === 'TF' || metode === 'QRIS') {
        akunKey = subMetode; 
    } else {
        alert("Metode tidak valid.");
        return;
    }

    const operation = (jenis === 'PEMASUKAN') ? 'add' : 'subtract';

    updateSaldo(akunKey, nominal, operation)
        .then(() => {
            const now = firebase.database.ServerValue.TIMESTAMP;
            const data = {
                tanggal: document.getElementById('tanggal').value,
                jenis: jenis,
                metode: metode, 
                subMetode: akunKey, 
                nama: document.getElementById('nama').value,
                nominal: nominal, 
                timestamp: now,
                lastUpdated: now 
            };

            return transaksiRef.push(data);
        })
        .then(() => {
            console.log("Transaksi berhasil ditambahkan dan saldo diperbarui!");
            e.target.reset(); 
            setJenis('PEMASUKAN', 'form');
            document.getElementById('subMetodeContainer').style.display = 'none';
            document.getElementById('tanggal').value = getTodayDateString();
        })
        .catch((error) => {
            console.error("Gagal menambahkan transaksi/memperbarui saldo:", error);
            alert("Gagal menambahkan data. Pastikan nominal dan koneksi valid.");
        });
});

document.getElementById('editForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const id = document.getElementById('editId').value;
    const oldTransaction = allTransactionsData[id];

    const newJenis = document.getElementById('editJenis').value;
    const newMetode = document.getElementById('editMetode').value;
    const newSubMetode = document.getElementById('editSubMetode').value;
    const newNominal = parseFloat(document.getElementById('editNominal').value);
    
    let newAkunKey;
    if (newMetode === 'CASH') {
        newAkunKey = 'CASH';
    } else if (newMetode === 'TF' || newMetode === 'QRIS') {
        newAkunKey = newSubMetode;
    }
    
    const oldNominal = oldTransaction.nominal;
    const oldAkunKey = oldTransaction.subMetode;
    const oldJenis = oldTransaction.jenis;

    // 1. Rollback saldo lama
    const rollbackOperation = oldJenis === 'PEMASUKAN' ? 'subtract' : 'add';
    
    updateSaldo(oldAkunKey, oldNominal, rollbackOperation)
        .then(() => {
            // 2. Terapkan saldo baru
            const newOperation = (newJenis === 'PEMASUKAN') ? 'add' : 'subtract';
            return updateSaldo(newAkunKey, newNominal, newOperation);
        })
        .then(() => {
            // 3. Simpan perubahan transaksi
            const now = firebase.database.ServerValue.TIMESTAMP;
            const newData = {
                tanggal: document.getElementById('editTanggal').value,
                jenis: newJenis,
                metode: newMetode,
                subMetode: newAkunKey,
                nama: document.getElementById('editNama').value,
                nominal: newNominal,
                lastUpdated: now 
            };

            return db.ref(`${TRANSAKSI_PATH}/${id}`).update(newData);
        })
        .then(() => {
            console.log(`Transaksi ${id} berhasil diperbarui dan saldo diperbarui!`);
            document.getElementById('editModal').style.display = 'none'; 
        })
        .catch((error) => {
            console.error("Gagal memperbarui transaksi/saldo:", error);
            alert("Gagal memperbarui data. Saldo mungkin perlu perbaikan manual.");
        });
});

function deleteTransaction(id) {
    if (!confirm("Yakin ingin menghapus transaksi ini? Saldo terkait akan dikembalikan.")) return;
    
    const transaction = allTransactionsData[id];
    const nominal = transaction.nominal;
    const akunKey = transaction.subMetode;
    const jenis = transaction.jenis;

    // 1. Rollback Saldo
    const operation = jenis === 'PEMASUKAN' ? 'subtract' : 'add';

    updateSaldo(akunKey, nominal, operation)
        .then(() => {
            // 2. Hapus Transaksi
            return db.ref(`${TRANSAKSI_PATH}/${id}`).remove();
        })
        .then(() => {
            console.log(`Transaksi ${id} berhasil dihapus dan saldo dikembalikan!`);
        })
        .catch((error) => {
            console.error("Gagal menghapus transaksi/saldo:", error);
            alert("Gagal menghapus data. Saldo mungkin perlu perbaikan manual.");
        });
}


function populateEditForm(id, data) {
    document.getElementById('editId').value = id;
    document.getElementById('editTanggal').value = data.tanggal;
    setJenis(data.jenis || 'PEMASUKAN', 'edit');
    document.getElementById('editMetode').value = data.metode || 'CASH'; 
    
    toggleEditSubMetode(data.metode || 'CASH'); 
    if (data.subMetode) {
        document.getElementById('editSubMetode').value = data.subMetode;
    }

    document.getElementById('editNama').value = data.nama;
    document.getElementById('editNominal').value = data.nominal;
    document.getElementById('editModal').style.display = 'block'; 
}

// --- NAVIGASI Halaman & MODAL HUBUNGI ---
function bukaJadwal() {
    window.location.href = 'jadwal.html';
}

function bukaJadwalPublik() {
    window.location.href = 'index.html';
}

function bukaHubungi() {
    const modal = document.getElementById('hubungiModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function tutupHubungi() {
    const modal = document.getElementById('hubungiModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

window.onclick = function(event) {
    const modalEdit = document.getElementById('editModal');
    const modalHubungi = document.getElementById('hubungiModal');
    if (event.target === modalEdit) {
        modalEdit.style.display = "none";
    }
    if (event.target === modalHubungi) {
        modalHubungi.style.display = "none";
    }
}

function filterAndRender() {
    renderDashboardAndTable(allTransactionsData);
}

function listenForTransactions() {
    transaksiRef.on('value', (snapshot) => {
        const data = snapshot.val();
        allTransactionsData = data || {}; 
        renderDashboardAndTable(allTransactionsData); 
    }, (error) => {
        console.error("Error membaca data Firebase:", error);
    });
}

function renderDashboardAndTable(allData) {
    const tbody = document.getElementById('transaksiTableBody');
    tbody.innerHTML = '';
    
    const filterPeriode = document.getElementById('filter-periode-ringkasan').value; 
    const today = getTodayDateString();
    const currentMonthYear = getCurrentMonthYearString();
    
    // --- LOGIKA PENCARIAN ---
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : ''; 

    let totalPemasukan = 0;
    let totalPengeluaran = 0;
    let filteredTransactions = {};

    for (const id in allData) {
        const transaction = allData[id];
        const transactionDate = transaction.tanggal;
        const transactionMonthYear = transactionDate.substring(0, 7);
        
        let isMatchPeriode = false;
        
        if (filterPeriode === 'ALL') {
            isMatchPeriode = true; 
        } else if (filterPeriode === 'MONTHLY') {
            isMatchPeriode = transactionMonthYear === currentMonthYear; 
        } else if (filterPeriode === 'DAILY') {
            isMatchPeriode = transactionDate === today; 
        } else if (filterPeriode.match(/^\d{4}-\d{2}$/)) { 
            isMatchPeriode = transactionMonthYear === filterPeriode;
        }
        
        let isMatchSearch = true;
        if (searchQuery.length > 0) {
            if (!transaction.nama || !transaction.nama.toLowerCase().includes(searchQuery)) {
                isMatchSearch = false;
            }
        }
        
        if (isMatchPeriode && isMatchSearch) {
            filteredTransactions[id] = transaction;

            if (transaction.jenis === 'PEMASUKAN') {
                totalPemasukan += transaction.nominal;
            } else if (transaction.jenis === 'PENGELUARAN') {
                totalPengeluaran += transaction.nominal;
            }
        }
    }

    // 1. UPDATE RINGKASAN DASHBOARD 
    document.getElementById('totalPemasukan').textContent = formatRupiah(totalPemasukan);
    document.getElementById('totalPengeluaran').textContent = formatRupiah(totalPengeluaran);
    
    let ratio = 0;
    if (totalPemasukan > 0) {
        ratio = (totalPengeluaran / totalPemasukan) * 100;
        if (ratio > 1000) ratio = 1000; 
    }
    
    const ratioText = `${ratio.toFixed(2)}%`;
    document.getElementById('persentasePengeluaran').textContent = ratioText;
    
    const warningElement = document.getElementById('warning-ratio');
    const limitInfoElement = document.getElementById('spending-limit-info');
    
    warningElement.style.display = 'none'; 
    
    if (totalPemasukan <= 0) {
        limitInfoElement.textContent = "Masukkan Pemasukan untuk menghitung rasio pengeluaran.";
        limitInfoElement.style.color = 'rgba(255,255,255,0.9)';
        
    } else if (ratio <= 100) {
        const remainingAmount = totalPemasukan - totalPengeluaran;
        
        if (ratio < 50) {
            limitInfoElement.textContent = `Hebat! Pengeluaran baru ${ratio.toFixed(2)}% dari Pemasukan. Sisa ${formatRupiah(remainingAmount)}.`;
            limitInfoElement.style.color = 'rgba(255,255,255,0.95)'; 
        } else if (ratio < 80) {
            limitInfoElement.textContent = `Hati-hati, pengeluaran sudah ${ratio.toFixed(2)}%. Sisa ${formatRupiah(remainingAmount)}.`;
            limitInfoElement.style.color = '#fde047'; 
        } else if (ratio <= 100) {
            limitInfoElement.textContent = `!!! Pengeluaran kritis ${ratio.toFixed(2)}%! Sisa ${formatRupiah(remainingAmount)}.`;
            limitInfoElement.style.color = '#fdba74'; 
            if (ratio === 100) {
                 warningElement.textContent = "🛑 Pemasukan HABIS! Pengeluaran mencapai 100%.";
                 warningElement.style.display = 'block';
            }
        }
        
    } else {
        const overSpent = totalPengeluaran - totalPemasukan;
        
        limitInfoElement.textContent = `Defisit! Pengeluaran melebihi Pemasukan sebesar ${formatRupiah(overSpent)}.`;
        limitInfoElement.style.color = '#fde047'; 
        
        warningElement.textContent = `🚨 Gawat! Rasio ${ratio.toFixed(2)}% (Overspent!).`;
        warningElement.style.display = 'block';
    }


    // 2. UPDATE DIAGRAM LINGKARAN 
    const sisaUang = totalPemasukan - totalPengeluaran;
    updateChart(totalPengeluaran, sisaUang, totalPemasukan); 

    // 3. RENDER TABEL TRANSAKSI
    const sortedKeys = Object.keys(filteredTransactions).sort((a, b) => {
        const dateA = filteredTransactions[a].tanggal;
        const dateB = filteredTransactions[b].tanggal;
        
        if (dateA !== dateB) {
            return dateB.localeCompare(dateA); 
        } else {
            return (filteredTransactions[b].lastUpdated || filteredTransactions[b].timestamp) - 
                   (filteredTransactions[a].lastUpdated || filteredTransactions[a].timestamp); 
        }
    });

    sortedKeys.forEach(id => {
        const transaction = filteredTransactions[id];
        const row = tbody.insertRow();
        
        const metodeValue = transaction.metode || 'NULL'; 
        let subMetodeText = '';
        
        if (metodeValue !== 'NULL' && metodeValue !== 'CASH' && transaction.subMetode) {
            subMetodeText = ` (${transaction.subMetode})`;
        }
        
        const metodeText = metodeValue + subMetodeText;

        const isPemasukan = transaction.jenis === 'PEMASUKAN';
        const jenisBadge = isPemasukan 
            ? `<span class="badge badge-pemasukan"><i class="fa-solid fa-circle-arrow-down"></i> Pemasukan</span>`
            : `<span class="badge badge-pengeluaran"><i class="fa-solid fa-circle-arrow-up"></i> Pengeluaran</span>`;

        const nominalClass = isPemasukan ? 'text-pemasukan' : 'text-pengeluaran';
        const nominalPrefix = isPemasukan ? '+ ' : '- ';

        row.insertCell().textContent = transaction.tanggal;
        row.insertCell().innerHTML = jenisBadge;
        row.insertCell().innerHTML = `<span class="badge badge-metode"><i class="fa-solid fa-receipt"></i> ${metodeText}</span>`; 
        row.insertCell().textContent = transaction.nama;
        row.insertCell().innerHTML = `<strong class="${nominalClass}">${nominalPrefix}${formatRupiah(transaction.nominal)}</strong>`;
        
        const lastUpdateTimestamp = transaction.lastUpdated || transaction.timestamp;
        row.insertCell().innerHTML = `<span class="timestamp-text"><i class="fa-regular fa-clock"></i> ${formatTimestamp(lastUpdateTimestamp)}</span>`;
        
        // Sel Aksi
        const aksiCell = row.insertCell();
        aksiCell.className = "text-center";
        aksiCell.innerHTML = `
            <button class="aksi-button edit-btn" onclick="populateEditForm('${id}', allTransactionsData['${id}'])"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="aksi-button delete-btn" onclick="deleteTransaction('${id}')"><i class="fa-solid fa-trash"></i> Hapus</button>
        `;
    });
}


// --- CHART INITIALIZATION ---
function updateChart(totalPengeluaran, sisaUang, totalPemasukan) {
    const ctx = document.getElementById('keuanganChart').getContext('2d');

    const chartData = {
        labels: ['Total Pengeluaran', 'Sisa Uang'],
        datasets: [{
            data: [totalPengeluaran, Math.max(0, sisaUang)], 
            backgroundColor: [
                'rgba(239, 68, 68, 0.85)', 
                'rgba(16, 185, 129, 0.85)'  
            ],
            borderColor: [
                '#ef4444',
                '#10b981'
            ],
            borderWidth: 2,
            hoverOffset: 6
        }]
    };

    if (keuanganChart) {
        keuanganChart.data = chartData;
        keuanganChart.update();
    } else {
        keuanganChart = new Chart(ctx, {
            type: 'doughnut',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: {
                                family: "'Plus Jakarta Sans', sans-serif",
                                size: 13,
                                weight: '600'
                            },
                            padding: 15
                        }
                    },
                    title: {
                        display: true,
                        text: `Total Pemasukan: ${formatRupiah(totalPemasukan)}`,
                        font: {
                            family: "'Plus Jakarta Sans', sans-serif",
                            size: 14,
                            weight: '700'
                        },
                        color: '#334155'
                    }
                },
                cutout: '65%'
            }
        });
    }
}
