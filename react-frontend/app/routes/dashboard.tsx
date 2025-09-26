// routes/dashboard.tsx - Updated with streaming pipeline integration
import type { LoaderFunctionArgs } from "react-router";
import { useUser } from "../contexts/UserContext";
import { useState, useEffect, useRef } from "react";
import type { EmailData } from "../types/email-processing";

// Import your EmailProcessingApp
interface EmailProcessingResult {
  emailId: string;
  isJobRelated: boolean;
  jobData: any;
  isFirstInstance: boolean;
  applicationStatus: string;
  processingErrors: string[];
}

interface ProcessingProgress {
  totalEmails: number;
  processedEmails: number;
  currentBatch: number;
  totalBatches: number;
  currentStatus: string;
  results: EmailProcessingResult[];
  errors: string[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  return {
    title: "Dashboard - Track My Jobs AI"
  };
}

export default function Dashboard() {
  const { user, logout } = useUser();
  const [isProcessing, setIsProcessing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo.toISOString().split('T')[0];
  });
  
  // Processing state
  const [progress, setProgress] = useState<ProcessingProgress>({
    totalEmails: 0,
    processedEmails: 0,
    currentBatch: 0,
    totalBatches: 0,
    currentStatus: 'idle',
    results: [],
    errors: []
  });

  // Refs for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const emailProcessorRef = useRef<any>(null);

  // Initialize EmailProcessingApp
  useEffect(() => {
    const initializeProcessor = async () => {
      try {
        // Dynamically import the EmailProcessingApp
        const { EmailProcessingApp } = await import('../lib/email-processor');
        emailProcessorRef.current = new EmailProcessingApp();
        await emailProcessorRef.current.initialize();
      } catch (error) {
        console.error('Failed to initialize email processor:', error);
        setAuthError('Failed to initialize AI processing engine. Please refresh and try again.');
      }
    };

    initializeProcessor();

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Gmail API rate limiting configuration
  const GMAIL_RATE_LIMITS = {
    QUOTA_UNITS_PER_SECOND: 250, // Per user limit
    MESSAGE_GET_QUOTA: 5, // Quota units per message.get call
    MESSAGE_LIST_QUOTA: 5, // Quota units per message.list call
    MAX_CONCURRENT_REQUESTS: 50, // Max messages.get per second
    BATCH_SIZE: 10, // Process emails in batches
    DELAY_BETWEEN_BATCHES: 1000, // 1 second delay between API batches
    WEBLLM_BATCH_SIZE: 5 // Process 5 emails through WebLLM at once
  };

  const parseEmailHeaders = (headers: any[]): { subject: string; from: string; to: string; date: string } => {
    const result = { subject: '', from: '', to: '', date: '' };
    
    headers.forEach((header: any) => {
      switch (header.name.toLowerCase()) {
        case 'subject':
          result.subject = header.value;
          break;
        case 'from':
          result.from = header.value;
          break;
        case 'to':
          result.to = header.value;
          break;
        case 'date':
          result.date = header.value;
          break;
      }
    });
    
    return result;
  };

  const extractEmailBody = (payload: any): string => {
    if (payload.body?.data) {
      return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
        if (part.mimeType === 'text/html' && part.body?.data) {
          return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
      }
    }
    
    return '';
  };

  // Fetch email list with pagination
  const fetchEmailList = async (query: string, accessToken: string, signal: AbortSignal): Promise<string[]> => {
    let allMessageIds: string[] = [];
    let pageToken: string | null = null;
    let pageNumber = 1;

    setProgress(prev => ({ ...prev, currentStatus: 'Fetching email list...' }));

    do {
      const url: string = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
      
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal
        });

        if (!response.ok) {
          throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.messages) {
          allMessageIds.push(...data.messages.map((msg: any) => msg.id));
        }
        
        pageToken = data.nextPageToken;
        pageNumber++;

        // Update progress
        setProgress(prev => ({
          ...prev,
          currentStatus: `Found ${allMessageIds.length} emails (page ${pageNumber})...`,
          totalEmails: allMessageIds.length
        }));

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        console.error('Error fetching email list:', error);
        throw error;
      }
    } while (pageToken && !signal.aborted);

    return allMessageIds;
  };

  // Fetch email details in batches with rate limiting
  const fetchEmailBatch = async (
    messageIds: string[], 
    accessToken: string, 
    signal: AbortSignal
  ): Promise<EmailData[]> => {
    const emails: EmailData[] = [];
    const batchSize = GMAIL_RATE_LIMITS.BATCH_SIZE;
    const totalBatches = Math.ceil(messageIds.length / batchSize);

    setProgress(prev => ({
      ...prev,
      totalBatches,
      currentStatus: 'Fetching email details...'
    }));

    for (let i = 0; i < messageIds.length; i += batchSize) {
      if (signal.aborted) throw new Error('Operation cancelled');

      const batch = messageIds.slice(i, i + batchSize);
      const currentBatch = Math.floor(i / batchSize) + 1;

      setProgress(prev => ({
        ...prev,
        currentBatch,
        currentStatus: `Fetching batch ${currentBatch}/${totalBatches}...`
      }));

      try {
        // Process batch with concurrent requests (respecting rate limits)
        const batchPromises = batch.map(async (messageId) => {
          const response = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              signal
            }
          );

          if (!response.ok) {
            throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
          }

          const emailDetail = await response.json();
          const headers = parseEmailHeaders(emailDetail.payload.headers || []);
          const body = extractEmailBody(emailDetail.payload);

          return {
            id: emailDetail.id,
            threadId: emailDetail.threadId,
            subject: headers.subject,
            from: headers.from,
            to: headers.to,
            date: headers.date,
            snippet: emailDetail.snippet || '',
            body: body,
            labels: emailDetail.labelIds || [],
            isUnread: emailDetail.labelIds?.includes('UNREAD') || false
          } as EmailData;
        });

        const batchResults = await Promise.all(batchPromises);
        emails.push(...batchResults);

        // Rate limiting delay between batches
        await new Promise(resolve => 
          setTimeout(resolve, GMAIL_RATE_LIMITS.DELAY_BETWEEN_BATCHES)
        );

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        console.error(`Error fetching batch ${currentBatch}:`, error);
        
        setProgress(prev => ({
          ...prev,
          errors: [...prev.errors, `Batch ${currentBatch} failed: ${error instanceof Error ? error.message : String(error)}`]
        }));
      }
    }

    return emails;
  };

  // Process emails through WebLLM pipeline
  const processEmailsWithAI = async (
    emails: EmailData[], 
    signal: AbortSignal
  ): Promise<EmailProcessingResult[]> => {
    if (!emailProcessorRef.current) {
      throw new Error('Email processor not initialized');
    }

    const results: EmailProcessingResult[] = [];
    const webllmBatchSize = GMAIL_RATE_LIMITS.WEBLLM_BATCH_SIZE;
    const totalBatches = Math.ceil(emails.length / webllmBatchSize);

    setProgress(prev => ({
      ...prev,
      currentStatus: 'Processing emails with AI...',
      totalBatches,
      currentBatch: 0
    }));

    for (let i = 0; i < emails.length; i += webllmBatchSize) {
      if (signal.aborted) throw new Error('Operation cancelled');

      const batch = emails.slice(i, i + webllmBatchSize);
      const currentBatch = Math.floor(i / webllmBatchSize) + 1;

      setProgress(prev => ({
        ...prev,
        currentBatch,
        currentStatus: `AI processing batch ${currentBatch}/${totalBatches}...`
      }));

      try {
        // Process batch through EmailProcessingApp
        const batchResults = await emailProcessorRef.current.processEmailsChronologically(batch);
        results.push(...batchResults);

        // Update progress with results
        setProgress(prev => ({
          ...prev,
          processedEmails: results.length,
          results: results
        }));

        // Small delay to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        console.error(`Error processing AI batch ${currentBatch}:`, error);
        
        setProgress(prev => ({
          ...prev,
          errors: [...prev.errors, `AI processing batch ${currentBatch} failed: ${error instanceof Error ? error.message : String(error)}`]
        }));
      }
    }

    return results;
  };

  // Main processing function
  const handleRetrieveAndProcessEmails = async () => {
    setIsProcessing(true);
    setAuthError(null);
    abortControllerRef.current = new AbortController();
    
    // Reset progress
    setProgress({
      totalEmails: 0,
      processedEmails: 0,
      currentBatch: 0,
      totalBatches: 0,
      currentStatus: 'Starting...',
      results: [],
      errors: []
    });

    try {
      const accessToken = localStorage.getItem('google_access_token');
      if (!accessToken) {
        setAuthError('Authentication required. Please sign out and sign back in to grant email access.');
        return;
      }

      if (!emailProcessorRef.current) {
        setAuthError('AI processing engine not ready. Please refresh and try again.');
        return;
      }

      const signal = abortControllerRef.current.signal;
      const fromDateFormatted = new Date(fromDate).toISOString().split('T')[0].replace(/-/g, '/');
      const query = `after:${fromDateFormatted}`;

      // Step 1: Get email list
      const messageIds = await fetchEmailList(query, accessToken, signal);
      
      if (messageIds.length === 0) {
        setProgress(prev => ({
          ...prev,
          currentStatus: 'No emails found for the specified date range.'
        }));
        return;
      }

      // Step 2: Fetch email details with rate limiting
      const emails = await fetchEmailBatch(messageIds, accessToken, signal);

      // Step 3: Process through AI pipeline
      const results = await processEmailsWithAI(emails, signal);

      setProgress(prev => ({
        ...prev,
        currentStatus: `Completed! Processed ${results.length} emails.`,
        processedEmails: results.length
      }));

      // Log results summary
      const jobRelatedCount = results.filter(r => r.isJobRelated).length;
      console.log(`Processing complete: ${jobRelatedCount} job-related emails found out of ${results.length} total`);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setProgress(prev => ({
          ...prev,
          currentStatus: 'Processing cancelled by user.'
        }));
      } else {
        console.error('Error in email processing pipeline:', error);
        if (error instanceof Error && (error.message.includes('401') || error.message.includes('403'))) {
          setAuthError('Your session has expired. Please sign out and sign back in to continue accessing your emails.');
        } else {
          setAuthError(`Processing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const cancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('google_access_token');
    logout();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Navigation */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-gray-600 rounded flex items-center justify-center">
                <span className="text-white font-medium text-xs">T</span>
              </div>
              <span className="text-lg font-medium text-gray-900 dark:text-white">Track My Jobs</span>
            </div>
            {user && (
              <div className="flex items-center space-x-3">
                <img 
                  src={user.picture} 
                  alt={user.name}
                  className="w-8 h-8 rounded-full"
                />
                <span className="text-sm text-gray-900 dark:text-white">{user.name}</span>
                <button 
                  onClick={handleLogout}
                  className="bg-gray-800 hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <div className="flex-grow">
        <div className="max-w-4xl mx-auto px-6 py-12">

          {/* Processing Progress Card */}
          {isProcessing && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 mb-8">
              <div className="text-center">
                <div className="mb-6">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                </div>
                
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Processing Your Emails
                </h2>
                
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  {progress.currentStatus}
                </p>

                {/* Progress Bar */}
                {progress.totalEmails > 0 && (
                  <div className="mb-6">
                    <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
                      <span>Progress</span>
                      <span>{progress.processedEmails}/{progress.totalEmails}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.processedEmails / progress.totalEmails) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Results Summary */}
                {progress.results.length > 0 && (
                  <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                    <h3 className="text-sm font-medium text-green-800 dark:text-green-300 mb-2">
                      Results So Far
                    </h3>
                    <div className="text-xs text-green-700 dark:text-green-400 space-y-1">
                      <div>Total emails processed: {progress.results.length}</div>
                      <div>Job-related emails: {progress.results.filter(r => r.isJobRelated).length}</div>
                      <div>New applications: {progress.results.filter(r => r.isFirstInstance).length}</div>
                    </div>
                  </div>
                )}

                {/* Errors */}
                {progress.errors.length > 0 && (
                  <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <h3 className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">
                      Processing Warnings ({progress.errors.length})
                    </h3>
                    <div className="text-xs text-red-700 dark:text-red-400 max-h-32 overflow-y-auto">
                      {progress.errors.slice(-3).map((error, index) => (
                        <div key={index} className="mb-1">{error}</div>
                      ))}
                    </div>
                  </div>
                )}

                <button 
                  onClick={cancelProcessing}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium transition-colors"
                >
                  Cancel Processing
                </button>
              </div>
            </div>
          )}

          {/* Main Action Card */}
          {!isProcessing && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 mb-8">
              <div className="text-center">
                <div className="mb-6">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Get Started with Email Organization
                </h2>
                
                <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-2xl mx-auto leading-relaxed">
                  Import your emails to automatically organize job applications, track responses, 
                  and never miss important deadlines.
                </p>
                
                {/* Privacy Notice */}
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">
                        🔒 Your Privacy is Protected
                      </h3>
                      <p className="text-xs text-green-700 dark:text-green-400">
                        All your data remains on your device. We never store, transmit, or access your personal information. 
                        Everything is processed locally in your browser by open source models for maximum privacy and security.
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Date Selection */}
                <div className="mb-6">
                  <label htmlFor="from-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Collect emails from:
                  </label>
                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <input
                        type="date"
                        id="from-date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        className="px-4 py-2.5 w-64 bg-gray-50 dark:bg-gray-900 border border-gray-600 dark:border-gray-500 rounded-md text-gray-600 dark:text-gray-400 font-medium focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-all duration-200"
                      />
                      <svg 
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-600 dark:text-gray-400 pointer-events-none" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                    Only emails from this date onwards will be analyzed
                  </p>
                </div>
                
                {/* Error Message */}
                {authError && (
                  <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
                          Processing Error
                        </h3>
                        <p className="text-xs text-red-700 dark:text-red-400">
                          {authError}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Results Summary */}
                {progress.results.length > 0 && !isProcessing && (
                  <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                    <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                      Last Processing Results
                    </h3>
                    <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
                      <div>Total emails processed: {progress.results.length}</div>
                      <div>Job-related emails: {progress.results.filter(r => r.isJobRelated).length}</div>
                      <div>New applications: {progress.results.filter(r => r.isFirstInstance).length}</div>
                      <div>Companies found: {new Set(progress.results.filter(r => r.jobData?.company_name).map(r => r.jobData.company_name)).size}</div>
                    </div>
                  </div>
                )}
                
                <button 
                  onClick={handleRetrieveAndProcessEmails}
                  disabled={isProcessing}
                  className={`px-8 py-3 w-72 bg-gray-50 dark:bg-gray-900 border border-gray-600 dark:border-gray-500 rounded-md text-gray-600 dark:text-gray-400 font-medium transition-all duration-200 flex items-center justify-center space-x-3 mx-auto ${
                    isProcessing 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-gray-600 hover:text-white dark:hover:bg-gray-500 dark:hover:text-white'
                  }`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" points="22,6 12,13 2,6"/>
                  </svg>
                  <span>Analyze My Emails with AI</span>
                </button>
              </div>
            </div>
          )}

          {/* Feature Preview Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="font-medium text-gray-900 dark:text-white">Smart Organization</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                AI automatically categorizes your job-related emails and tracks application status.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-medium text-gray-900 dark:text-white">Never Miss Deadlines</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Get intelligent reminders for follow-ups, interviews, and application deadlines.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            © 2025 Track My Jobs. Your privacy-first job tracking solution.
          </p>
        </div>
      </footer>
    </div>
  );
}
