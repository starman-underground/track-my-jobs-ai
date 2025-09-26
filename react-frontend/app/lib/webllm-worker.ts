export interface WebLLMConfig {
    model: string;
    temperature: number;
    maxTokens: number;
}

export interface WorkerMessage {
    id: string;
    type: "initialize" | "classify" | "extract" | "analyze" | "status" | "terminate";
    config?: WebLLMConfig;
    prompt?: string;
    subject?: string;
}

export interface WorkerResponse {
    id: string;
    result?: any;
    error?: string;
    progress?: {
        text: string;
        percent: number;
    };
}

export class WebLLMWorker {
    private worker: Worker | null = null;
    private isInitialized: boolean = false;
    private pendingRequests = new Map<string, {
        res: (value: any) => void;
        rej: (error: Error) => void;
    }>();

    async initialize(): Promise<void> {
        if (typeof window === "undefined" || typeof Worker === "undefined") {
            throw new Error("WebWorker is not supported in this environment");
        }

        try {
            const workerBlob = new Blob([this.getWorkerCode()], { type: "application/javascript" });
            const workerUrl = URL.createObjectURL(workerBlob);

            this.worker = new Worker(workerUrl, { type: "module" })

            this.worker.onmessage = this.handleWorkerMessage.bind(this);
            this.worker.onerror = (error) => {
                console.error("WebLLM Worker error:", error);
                this.rejectAllPending(new Error(`Worker error: ${error.message}`));
            };

            await this.postMessage({
                id: "init",
                type: "initialize",
                config: {
                    model: "Phi-3.5-mini-instruct-q4f32_1-MLC",
                    temperature: 0.1,
                    maxTokens: 1024
                }
            });

            this.isInitialized = true;
            console.log("WebLLM Worker initialized successfully");

            URL.revokeObjectURL(workerUrl);

        } catch (error) {
            console.error("Failed to initialize WebLLM Worker:", error);
            throw error;
        }
    }

    private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
        const { id, result, error, progress } = event.data;
        
        if (progress) {
            console.log(`WebLLM Progress: ${progress.text} (${progress.percent}%)`);
            return;
        }

        const pendingRequest = this.pendingRequests.get(id);
        if (!pendingRequest) {
            console.warn(`Received response for unknown request ID: ${id}`);
            return;
        }

        this.pendingRequests.delete(id);

        if (error) {
            pendingRequest.rej(new Error(error));
        } else {
            pendingRequest.res(result);
        }
    }

    private postMessage(message: WorkerMessage): Promise<any> {
        return new Promise((res, rej) => {
            if (!this.worker) {
                rej(new Error("Worker not initialized"));
                return;
            }

            const messageId = message.id || `msg_${Date.now()}_${Math.random()}`;
            const messageWithId = { ...message, id: messageId };

            this.pendingRequests.set(messageId, { res, rej });

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(messageId);
                rej(new Error(`Request ${messageId} timed out`));
            }, 60000);

            const originalRes = res;
            const originalRej = rej;

            this.pendingRequests.set(messageId, {
                res: (value) => {
                    clearTimeout(timeout);
                    originalRes(value);
                },
                rej: (error) => {
                    clearTimeout(timeout);
                    originalRej(error);
                }
            });

            this.worker.postMessage(messageWithId);
        });
    }
    
    private rejectAllPending(error: Error): void {
        for (const [id, { rej }] of this.pendingRequests) {
            rej(error);
        }
        this.pendingRequests.clear();
    }

    async classify(emailContent: string): Promise<boolean> {
        if (!this.isInitialized) {
            throw new Error("WebLLM Worker not initialized");
        }

        try {
            const result = await this.postMessage({
                id: `classify_${Date.now()}`,
                type: "classify",
                prompt: `You are a binary email classifier. Respond with ONLY "YES" or "NO".
Is this email related to job applications, recruitment, interviews, or hiring?

Email Content:
${emailContent.substring(0, 2000)}`
            });

            return result === true || result === "YES";
        } catch (error) {
            console.error("Failed to classify email:", error);
            return false;
        }
    }

    async extractJobData(emailContent: string): Promise<any> {
        if (!this.isInitialized) {
            throw new Error("WebLLM Worker not initialized");
        }

        try {
            const result = await this.postMessage({
                id: `extact_${Date.now()}`,
                type: "extract",
                prompt: `Extract job application details in this exact JSON format. Use "Unknown" for missing information:

{
    "company_name": "string",
    "job_title": "string",
    "application_date": "YYYY-MM-DD",
    "contact_email": "string",
    "job_id": "string",
    "location": "string",
    "salary_range": "string"
}

Email Content:
${emailContent.substring(0, 3000)}`
            });

            return result;
        } catch (error) {
            console.error("Job data extraction failed:", error);
            return null;
        }
    }

    async determineStatus(emailContent: string, emailSubject: string): Promise<string> {
        if (!this.isInitialized) {
            throw new Error("WebLLM Worker not initialized");
        }

        try {
            const result = await this.postMessage({
                id: `status_${Date.now()}`,
                type: "status",
                prompt: `Analyze this email and return ONLY one of these standardized statuses:

applied, under_review, interview_scheduled, interview_completed, offer_received, offer_accepted, rejected, withdrawn, pending

Subject: ${emailSubject}
Content: ${emailContent.substring(0, 2000)}`
            });

            const validStatuses = [
                "applied", "under_review", "interview_scheduled", "interview_completed",
                "offer_received", "offer_accepted", "rejected", "withdrawn", "pending"
            ];

            return validStatuses.includes(result) ? result : "pending";
        } catch (error) {
            console.error("Status determination failed:", error);
            return "pending";
        }
    }

    terminate(): void {
        if (this.worker) {
            this.worker.postMessage({ id: "terminate", type: "terminate" });

            this.worker.terminate();
            this.worker = null;
            this.isInitialized = false;

            this.rejectAllPending(new Error("Worker terminated"));

            console.log("WebLLM Worker terminated");
        }
    }

    getWorkerCode(): string {
        return `
// WebLLM Worker Implementation
let engine = null;
let isInitialized = false;

const importWebLLM = async () => {
    try {
        const module = await import('https://esm.run/@mlc-ai/web-llm');
        return module;
    } catch (error) {
        console.error('Failed to import WebLLM:', error);
        throw new Error('WebLLM not available');
    }
};

const initializeEngine = async (config) => {
    try {
        const { MLCEngine } = await importWebLLM();

        engine = new MLCEngine();

        const progressCallback = (report) => {
            self.postMessage({
                id: 'progress',
                progress: {
                    text: report.text,
                    percent: report.percent || 0
                }
            });
        };

        await engine.reload(config.model, {
            temperature: config.temperature,
            max_gen_len: config.maxTokens,
            initProgressCallback: progressCallback
        });

        isInitialized = true;
        return { success: true };
    } catch (error) {
        console.error('Engine initialization failed:', error);
        throw error;
    }
};

const processPrompt = async (prompt, type) => {
    if (!isInitialized || !engine) {
        throw new Error('WebLLM engine not initialized');
    }
    
    try {
        const messages = [
            { role: 'user', content: prompt }
        ];

        const response  = await engine.chat.completions.create({
            messages: messages,
            temperature: 0.1,
            max_tokens: 512
        });

        const content = response.choices[0]?.message?.content?.trim() || '';

        switch (type) {
            case 'classify':
                const isJobRelated = content.toUpperCase().includes('YES');
                return isJobRelated;
            case 'extract':
                let jsonStr = content;

                const jsonMatch = jsonStr.match(/\`\`\`(?:json)?\\s*({[\\s\\S]*?})\\s*\`\`\`/)
                if (jsonMatch) {
                    jsonStr = jsonMatch[1];
                }

                const jsonStart = jsonStr.indexOf('{');
                const jsonEnd = jsonStr.lastIndexOf('}') + 1;
                if (jsonStart !== -1 && jsonEnd > jsonStart) {
                    jsonStr = jsonStr.substring(jsonStart, jsonEnd);
                }

                const parsed = JSON.parse(jsonStr);
                return parsed;
            case 'status':
                const validStatuses = [
                    "applied", "under_review", "interview_scheduled",
                    "interview_completed", "offer_received", "offer_accepted", 
                    "rejected", "withdraw", "pending"
                ];

                const status = content.toLowerCase();
                const foundStatus = validStatuses.find(s => status.includes(s));
                return foundStatus || 'pending';
            default:
                return content;
        }
    } catch (error) {
        console.error('Processing failed:', error);
        throw error;
    }
};

self.onmessage = async function(event) {
    const { type, id, config, prompt } = event.data;
    try {
        let result;

        switch (type) {
            case 'initialize':
                await initializeEngine(config);
                result = { success: true };
                break;
            case 'classify':
                result = await processPrompt(prompt, 'classify');
                break;
            case 'extract':
                result = await processPrompt(prompt, 'extract');
                break;
            case 'status':
                result = await processPrompt(prompt, 'status');
                break;
            case 'terminate':
                if (engine) {
                    engine = null;
                    isInitialized = false;
                }
                self.close();
                return;
            default:
                throw new Error(\`Unknown message type: \${type}\`);
        }
        self.postMessage({ id, result });
    } catch (error) {
        console.error('Worker processing error:', error);
        self.postMessage({
            id,
            error: error.message || 'Unknown error occurred'
        });
    }
};

self.onerror = function(error) {
    console.error('Worker error:', error);
    self.postMessage({
        id: 'error',
        error: 'Worker encountered an error: ' + error.message
    });
};
`;
    }
}