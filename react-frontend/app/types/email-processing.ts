export interface EmailData {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    snippet: string;
    body: string;
    labels: string[];
    isUnread: boolean;
}

export interface JobAppData {
    company_name: string;
    title: string;
    location: string;
    application_date: string;
    salary_range: string;
}

export interface ProcessedEmail {
    email_id: string;
    is_job_related: boolean;
    job_data: JobAppData | null;
    is_first_instance: boolean;
    application_status: string;
    errors: string[];
    processing_time?: number;
}

export interface ApplicationTracker {
    [key: string]: {
        company_name: string;
        title: string;
        first_seen: string;
        current_status: string;
        status_history: string[];
        email_ids: string[];
        last_updated: string;
    }
}

export interface ProcessingState {
    isProcessing: boolean;
    processedCount: number;
    totalCount: number;
    currentEmail?: string;
    results: ProcessedEmail[];
    errors: string[];
}