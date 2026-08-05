// --- SYSTEM ACCESS & AUDIT LOGGER SYSTEM ---
(function() {
    // Helper sanitasi IP key untuk Firebase Database
    function sanitizeIpKey(ip) {
        if (!ip) return "unknown_ip";
        return ip.replace(/[\.\:\#\$\[\]]/g, "_");
    }

    // Fungsi pembantu mengekstrak info OS dan Perangkat dari User Agent
    function parseDeviceInfo() {
        const ua = navigator.userAgent;
        let device = "Desktop / PC";
        
        if (/Android/i.test(ua)) {
            const match = ua.match(/Android\s+([0-9.]+);?\s*([^;)]*)/i);
            device = match && match[2] ? `Android (${match[2].trim()})` : "Android Device";
        } else if (/iPhone|iPad|iPod/i.test(ua)) {
            device = "Apple iOS Device";
        } else if (/Windows/i.test(ua)) {
            device = "Windows PC";
        } else if (/Macintosh/i.test(ua)) {
            device = "Mac OS";
        } else if (/Linux/i.test(ua)) {
            device = "Linux PC";
        }
        return device;
    }

    // Ekstrak level baterai jika didukung browser Battery API
    function getBatteryLevel(callback) {
        if (navigator.getBattery) {
            navigator.getBattery().then(battery => {
                const level = Math.round(battery.level * 100) + "%" + (battery.charging ? " ⚡" : "");
                callback(level);
            }).catch(() => callback("N/A"));
        } else {
            callback("N/A");
        }
    }

    // Ambil IP Publik dari layanan API Publik gratis (ipify) dengan fallback
    let currentCachedIp = null;
    function fetchPublicIp(callback) {
        if (currentCachedIp) {
            callback(currentCachedIp);
            return;
        }
        fetch("https://api.ipify.org?format=json")
            .then(res => res.json())
            .then(data => {
                currentCachedIp = data.ip || "Unknown IP";
                callback(currentCachedIp);
            })
            .catch(() => {
                currentCachedIp = "127.0.0.1";
                callback(currentCachedIp);
            });
    }

    // Dapatkan Nama Tamu dari LocalStorage
    function getVisitorName() {
        return localStorage.getItem("guest_name") || "";
    }

    // Simpan Nama Tamu & Daftarkan Alias ke Firebase / LocalStorage
    function setVisitorName(name) {
        const cleanName = (name || "").trim();
        if (!cleanName) return;
        
        localStorage.setItem("guest_name", cleanName);
        
        fetchPublicIp(ip => {
            const ipKey = sanitizeIpKey(ip);
            const aliasData = {
                ip: ip,
                name: cleanName,
                updatedAt: new Date().toISOString()
            };

            // Simpan alias lokal
            try {
                const aliases = JSON.parse(localStorage.getItem("system_ip_aliases") || "{}");
                aliases[ipKey] = aliasData;
                localStorage.setItem("system_ip_aliases", JSON.stringify(aliases));
            } catch(e) {}

            // Simpan alias ke Firebase
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
                try {
                    firebase.database().ref(`keuangan/ip_aliases/${ipKey}`).set(aliasData);
                } catch(e) {
                    console.warn("Firebase ip_aliases set warning:", e);
                }
            }

            // Catat log pengisian nama
            logUserActivity(`Mengisi Nama Tamu: "${cleanName}"`);
        });
    }

    // Kirim data log ke Firebase Realtime DB & LocalStorage
    function logUserActivity(actionDetails, extraData = {}) {
        fetchPublicIp(ip => {
            getBatteryLevel(battery => {
                const pageName = window.location.pathname.split("/").pop() || "index.html";
                const now = new Date();
                const timestampStr = now.toLocaleDateString("id-ID", {
                    day: "2-digit", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit", second: "2-digit"
                });

                const logItem = {
                    timestamp: timestampStr,
                    rawTimestamp: Date.now(),
                    ip: ip,
                    visitorName: getVisitorName(),
                    action: actionDetails || `Membuka halaman ${pageName}`,
                    deviceInfo: parseDeviceInfo(),
                    userAgent: navigator.userAgent,
                    battery: battery,
                    page: pageName,
                    ...extraData
                };

                // Backup ke LocalStorage
                try {
                    const localLogs = JSON.parse(localStorage.getItem("system_access_logs") || "[]");
                    localLogs.push(logItem);
                    if (localLogs.length > 100) localLogs.shift();
                    localStorage.setItem("system_access_logs", JSON.stringify(localLogs));
                } catch(e) {}

                // Simpan ke Firebase Realtime Database
                if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
                    try {
                        firebase.database().ref('keuangan/access_logs').push(logItem);
                    } catch(e) {
                        console.warn("Log Firebase warning:", e);
                    }
                }
            });
        });
    }

    // Admin set custom name for an IP
    function setAdminIpAlias(ip, customName, callback) {
        const cleanName = (customName || "").trim();
        const ipKey = sanitizeIpKey(ip);
        const aliasData = {
            ip: ip,
            name: cleanName,
            updatedBy: "Admin",
            updatedAt: new Date().toISOString()
        };

        // Save local
        try {
            const aliases = JSON.parse(localStorage.getItem("system_ip_aliases") || "{}");
            if (cleanName) {
                aliases[ipKey] = aliasData;
            } else {
                delete aliases[ipKey];
            }
            localStorage.setItem("system_ip_aliases", JSON.stringify(aliases));
        } catch(e) {}

        // Save Firebase
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
            const ref = firebase.database().ref(`keuangan/ip_aliases/${ipKey}`);
            if (cleanName) {
                ref.set(aliasData).then(() => { if (callback) callback(true); });
            } else {
                ref.remove().then(() => { if (callback) callback(true); });
            }
        } else {
            if (callback) callback(true);
        }
    }

    // Expose API Global
    window.SystemLogger = {
        getVisitorName: getVisitorName,
        setVisitorName: setVisitorName,
        logUserActivity: logUserActivity,
        setAdminIpAlias: setAdminIpAlias,
        sanitizeIpKey: sanitizeIpKey,
        fetchPublicIp: fetchPublicIp
    };

    // Auto Record Access on Load
    window.addEventListener("DOMContentLoaded", () => {
        const pageName = window.location.pathname.split("/").pop() || "index.html";
        const visitorName = getVisitorName();
        const initialAction = visitorName 
            ? `Membuka halaman ${pageName}`
            : `Membuka halaman ${pageName} (Belum mengisi nama)`;
            
        logUserActivity(initialAction);
    });
})();
