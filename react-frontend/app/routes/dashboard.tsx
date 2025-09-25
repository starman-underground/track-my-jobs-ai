import type { LoaderFunctionArgs } from "react-router";
import { useUser } from "../contexts/UserContext";
import { useState } from "react";

interface EmailData {
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

// Loader function required by React Router v7
export async function loader({ request }: LoaderFunctionArgs) {
  return {
    title: "Dashboard - Track My Jobs AI"
  };
}

export default function Dashboard() {
  const { user, logout } = useUser();
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    // Default to 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo.toISOString().split('T')[0];
  });

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

  const fetchAllEmails = async (query: string, accessToken: string): Promise<EmailData[]> => {
    let allMessageIds: any[] = [];
    let pageToken: string | null = null;
    let pageNumber = 1;

    // First, get all message IDs
    do {
        const url: string = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const response: Response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            }
        });
        if (!response.ok) {
            throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
        }
        const data: any = await response.json();
        if (data.messages) {
          allMessageIds.push(...data.messages);
          console.log(`Page ${pageNumber} of ${data.messages.length} messages`);
        }
        pageToken = data.nextPageToken;
        pageNumber++;
    } while (pageToken);

    // Now fetch detailed information for each message
    const emailPromises = allMessageIds.slice(0, 50).map(async (message: any): Promise<EmailData> => {
      const detailResponse: Response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!detailResponse.ok) {
        throw new Error(`Gmail API error: ${detailResponse.status} ${detailResponse.statusText}`);
      }
      
      const emailDetail: any = await detailResponse.json();
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
      };
    });

    return Promise.all(emailPromises);
  }

  const handleRetrieveEmails = async () => {
    setIsLoadingEmails(true);
    setAuthError(null);
    
    try {
      // Get the access token from Google OAuth
      const accessToken = localStorage.getItem('google_access_token');
      if (!accessToken) {
        setAuthError('Authentication required. Please sign out and sign back in to grant email access.');
        setIsLoadingEmails(false);
        return;
      }

      // Format the fromDate for Gmail API query
      const fromDateFormatted = new Date(fromDate).toISOString().split('T')[0].replace(/-/g, '/');
      
      // Gmail API query to search for emails from the specified date
      const query = `after:${fromDateFormatted}`;
      
      // Call Gmail API to get structured email data
      const structuredEmails: EmailData[] = await fetchAllEmails(query, accessToken);
      console.log('Retrieved structured emails:', structuredEmails);

      if (structuredEmails && structuredEmails.length > 0) {
        console.log(`Found ${structuredEmails.length} structured emails from ${fromDate}`);
        
        // Log sample of structured data
        structuredEmails.slice(0, 3).forEach((email, index) => {
          console.log(`Email ${index + 1}:`, {
            subject: email.subject,
            from: email.from,
            date: email.date,
            snippet: email.snippet,
            isUnread: email.isUnread,
            labels: email.labels
          });
        });
      } else {
        console.log('No emails found for the specified date range');
      }

    } catch (error) {
       console.error('Error retrieving emails:', error);
       // Handle token expiration or other auth errors
       if (error instanceof Error && (error.message.includes('401') || error.message.includes('403'))) {
         setAuthError('Your session has expired. Please sign out and sign back in to continue accessing your emails.');
       } else {
         setAuthError('Failed to retrieve emails. Please try again or check your internet connection.');
       }
    } finally {
      setIsLoadingEmails(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('google_access_token');
    logout();
    // Navigate back to home - this will be handled by the parent component
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

        {/* Main Action Card */}
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
                      Authentication Required
                    </h3>
                    <p className="text-xs text-red-700 dark:text-red-400">
                      {authError}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <button 
              onClick={handleRetrieveEmails}
              disabled={isLoadingEmails}
              className={`px-8 py-3 w-72 bg-gray-50 dark:bg-gray-900 border border-gray-600 dark:border-gray-500 rounded-md text-gray-600 dark:text-gray-400 font-medium transition-all duration-200 flex items-center justify-center space-x-3 mx-auto ${
                isLoadingEmails 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:bg-gray-600 hover:text-white dark:hover:bg-gray-500 dark:hover:text-white'
              }`}
            >
              {isLoadingEmails ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-600 dark:text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Retrieving Emails...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" points="22,6 12,13 2,6"/>
                  </svg>
                  <span>Retrieve My Emails</span>
                </>
              )}
            </button>
          </div>
        </div>

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
