export interface KnownApplication {
    application_key: string;
    company_name: string;
    job_title: string;
    application_date: string;
    contact_email: string;
    job_id: string;
    location: string;
    salary_range: string;
    first_seen: string;
    status_history: string[];
    current_status: string;
    email_count: number;
    last_updated: string;
}

export interface ProcessingHistoryEntry {
    email_id: string;
    is_job_related: boolean;
    job_data: any;
    is_first_instance: boolean;
    application_status: string;
    errors: string[];
    processed_at: string;
}

export interface UserSettings {
    setting: string;
    value: any;
    updated_at: string;
}

export class ApplicationStateManager {
    private dbName = "EmailJobTrackerDB";
    private dbVersion = 1;
    private db: IDBDatabase | null = null;

    async initialize(): Promise<void> {
        return new Promise((res, rej) => {
            if (typeof window === 'undefined' || !window.indexedDB) {
                rej(new Error("IndexedDB is not supported in this environment"));
                return;
            }

            const req = indexedDB.open(this.dbName, this.dbVersion);
            req.onerror = () => {
                console.error("Failedto open IndexedDB:", req.error);
                rej(req.error);
            };

            req.onsuccess = () => {
                this.db = req.result;
                console.log("IndexedDB initialized successfully");
                res();
            };

            req.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains("knownApplications")) {
                    const appStore = db.createObjectStore("knownApplications", {
                        keyPath: "application_key",
                    });
                    appStore.createIndex("company", "company_name", { unique: false });
                    appStore.createIndex("status", "current_status", { unique: false });
                    appStore.createIndex("date", "first_seen", { unique: false });
                    console.log("Created knownApplications store");
                }

                if (!db.objectStoreNames.contains("processingHistory")) {
                    const historyStore = db.createObjectStore("processingHistory", {
                        keyPath: "email_id",
                    });
                    historyStore.createIndex("date", "processed_at", { unique: false });
                    historyStore.createIndex("job_related", "is_job_related", { unique: false });
                    console.log("Created processingHistory store");
                }

                if (!db.objectStoreNames.contains("userSettings")) {
                    const settingsStore = db.createObjectStore("userSettings", {
                        keyPath: "setting",
                    });
                    console.log("Created userSettings store");
                }
            };
        });
    }

    private ensureDB(): IDBDatabase {
        if (!this.db) {
            throw new Error("Database not initialized. Call initialize() first.");
        }
        return this.db;
    }

    async getKnownApplications(): Promise<Record<string, KnownApplication>> {
        const db = this.ensureDB();

        return new Promise((res, rej) => {
            const transaction = db.transaction(["knownApplications"], "readonly");
            const store = transaction.objectStore("knownApplications");
            const req = store.getAll();

            req.onsuccess = () => {
                const apps: Record<string, KnownApplication> = {};
                req.result.forEach((app: KnownApplication) => {
                    apps[app.application_key] = app;
                });
                res(apps);
            };

            req.onerror = () => {
                console.error("Failed to getknown applications:", req.error);
                rej(req.error);
            };
        });
    }

    async updateKnownApplications(knownApplications: Record<string, any>): Promise<void> {
        const db = this.ensureDB();

        return new Promise((res, rej) => {
            const transaction = db.transaction(["knownApplications"], "readwrite");
            const store = transaction.objectStore("knownApplications");

            let completedOperations = 0;
            const totalOperations = Object.keys(knownApplications).length;

            if (totalOperations === 0) {
                res();
                return;
            }

            const checkComplete = () => {
                completedOperations++;
                if (completedOperations >= totalOperations) {
                    res();
                }
            }

            transaction.onerror = () => {
                console.error("Transaction failed: ", transaction.error);
                rej(transaction.error);
            };

            for (const [key, app] of Object.entries(knownApplications)) {
                const applicationRecord: KnownApplication = {
                    application_key: key,
                    company_name: app.company_name || "Unknown",
                    job_title: app.job_title || "Unknown",
                    application_date: app.application_date || "",
                    contact_email: app.contact_email || "",
                    job_id: app.job_id || "",
                    location: app.location || "",
                    salary_range: app.salary_range || "",
                    first_seen: app.first_seen || new Date().toISOString(),
                    status_history: app.status_history || ["applied"],
                    current_status: app.current_status || "applied",
                    email_count: app.email_count || 1,
                    last_updated: app.last_updated || new Date().toISOString(),
                };

                const req = store.put(applicationRecord);
                req.onsuccess = checkComplete;
                req.onerror = () => {
                    console.error(`Failed to update application ${key}:`, req.error);
                    checkComplete();
                };
            }
        });
    }

    async getApplicationsByCompany(companyName: string): Promise<KnownApplication[]> {
        const db = this.ensureDB();

        return new Promise((res, rej) => {
            const transaction = db.transaction(["knownApplications"], "readonly");
            const store = transaction.objectStore("knownApplications");
            const index = store.index("company");
            const req = index.getAll(companyName);

            req.onsuccess = () => res(req.result);
            req.onerror = () => {
                console.error("Failed to get applications by company:", req.error);
                rej(req.error);
            };
        });
    }

    async getApplicationsByStatus(status: string): Promise<KnownApplication[]> {
        const db = this.ensureDB();
        return new Promise((res, rej) => {
            const transaction = db.transaction(["knownApplications"], "readonly");
            const store = transaction.objectStore("knownApplications");
            const index = store.index("status");
            const req = index.getAll(status);

            req.onsuccess = () => res(req.result);
            req.onerror = () => {
                console.error("Failed to get applications by status:", req.error);
                rej(req.error);
            };
        });
    }

    async saveProcessingResult(emailId: string, result: any): Promise<void> {
        const db = this.ensureDB();

        return new Promise((res, rej) => {
            const transaction = db.transaction(["processingHistory"], "readwrite");
            const store = transaction.objectStore("processingHistory");
            
            const historyEntry: ProcessingHistoryEntry = {
                email_id: emailId,
                is_job_related: result.isJobRelated || false,
                job_data: result.jobData || null,
                is_first_instance: result.isFirstInstance || false,
                application_status: result.applicationStatus || "unknown",
                errors: result.errors || [],
                processed_at: new Date().toISOString()
            };

            const req = store.put(historyEntry);
            req.onsuccess = () => res();
            req.onerror = () => {
                console.error("Failed to save processing result:", req.error);
                rej(req.error);
            };
        });
    }

    async getProcessingHistory(limit: number = 100): Promise<ProcessingHistoryEntry[]> {
        const db = this.ensureDB();

        return new Promise((res, rej) => {
            const transaction = db.transaction(["processingHistory"], "readonly");
            const store = transaction.objectStore("processingHistory");
            const index = store.index("date");

            const req = index.openCursor(null, "prev");
            const results: ProcessingHistoryEntry[] = [];
            let count = 0;

            req.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor && count < limit) {
                    results.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    res(results);
                }
            };

            req.onerror = () => {
                console.error("Failed to get processing history:", req.error);
                rej(req.error);
            };
        });
    }

    async getJobRelatedHistory(): Promise<ProcessingHistoryEntry[]> {
        const db = this.ensureDB();

        return new Promise((res, rej) => {
            const transaction = db.transaction(["processingHistory"], "readonly");
            const store = transaction.objectStore("processingHistory");
            const index = store.index("job_related");
            const req = index.getAll(IDBKeyRange.only(true));

            req.onsuccess = () => res(req.result);
            req.onerror = () => {
                console.error("Failed to get job-related history:", req.error);
                rej(req.error);
            };
        });
    }

    async getSetting(settingName: string): Promise<any> {
        const db = this.ensureDB();

        return new Promise((res, rej) => {
            const transaction = db.transaction(["userSettings"], "readonly");
            const store = transaction.objectStore("userSettings");
            const req = store.get(settingName);

            req.onsuccess = () => {
                const result = req.result;
                res(result ? result.value : null);
            }

            req.onerror = () => {
                console.error("Failed to get setting:", req.error);
                rej(req.error);
            };
        });
    }

    async setSetting(settingName: string, value: any): Promise<void> {
        const db = this.ensureDB();

        return new Promise((res, rej) => {
            const transaction = db.transaction(["userSettings"], "readwrite");
            const store = transaction.objectStore("userSettings");

            const settingRecord: UserSettings = {
                setting: settingName,
                value,
                updated_at: new Date().toISOString()
            };

            const req = store.put(settingRecord);
            req.onsuccess = () => res();
            req.onerror = () => {
                console.error("Failed to set setting:", req.error);
                rej(req.error);
            };
        });
    }

    async getAllSettings(): Promise<Record<string, any>> {
        const db = this.ensureDB();

        return new Promise((res, rej) => {
            const transaction = db.transaction(["userSettings"], "readonly");
            const store = transaction.objectStore("userSettings");
            const req = store.getAll();

            req.onsuccess = () => {
                const settings: Record<string, any> = {};
                req.result.forEach((setting: UserSettings) => {
                    settings[setting.setting] = setting.value;
                });
                res(settings);
            };

            req.onerror = () => {
                console.error("Failed to get all settings:", req.error);
                rej(req.error);
            };
        });
    }

    async clearAllData(): Promise<void> {
        const db = this.ensureDB();

        return new Promise((res, rej) => {
            const transaction = db.transaction(["knownApplications", "processingHistory", "userSettings"], "readwrite");
            
            let completedOperations = 0;
            const totalOperations = 3;
            
            const checkComplete = () => {
                completedOperations++;
                if (completedOperations >= totalOperations) {
                    console.log("All data cleared");
                    res();
                }
            }

            transaction.onerror = () => {
                console.error("Failed to clear data:", transaction.error);
                rej(transaction.error);
            };

            const stores = ["knownApplications", "processingHistory", "userSettings"];
            stores.forEach((storeName) => {
                const store = transaction.objectStore(storeName);
                const req = store.clear();
                req.onsuccess = checkComplete;
                req.onerror = () => {
                    console.error(`Failed to clear ${storeName}:`, req.error);
                    checkComplete();
                };
            });
        });
    }

    async getStats(): Promise<{
        totalApplications: number;
        totalEmails: number;
        companiesAppliedTo: number;
        statusBreakdown: Record<string, number>;
    }> {
        const [applications, history] = await Promise.all([
            this.getKnownApplications(),
            this.getProcessingHistory(1000)
        ]);

        const statusBreakdown: Record<string, number> = {};
        const companies = new Set<string>();

        Object.values(applications).forEach((app) => {
            statusBreakdown[app.current_status] = (statusBreakdown[app.current_status] || 0) + 1;
            companies.add(app.company_name);
        });

        return {
            totalApplications: Object.keys(applications).length,
            totalEmails: history.filter(h => h.is_job_related).length,
            companiesAppliedTo: companies.size,
            statusBreakdown
        };
    }

    async loadPersistedState(): Promise<void> {
        console.log("State manager ready for operations");
    }
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log("IndexedDB connection closed");
        }
    }
}