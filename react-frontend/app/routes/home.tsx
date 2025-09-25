import type { LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { GoogleLogin, googleLogout, useGoogleLogin } from "@react-oauth/google";


// Loader function required by React Router v7
export async function loader({ request }: LoaderFunctionArgs) {
  // Return any data needed for the home page
  return {
    title: "Track My Jobs AI",
    message: "Welcome to your job tracking application!"
  };
}

// Default export - simplified React component with discreet styling
export default function Home() {
  const [user, setUser] = useState<{ name: string; email: string; picture: string } | null>(null);

  const handleLoginSuccess = (credentialResponse: any) => {
    // Decode the JWT token to get user information
    if (credentialResponse.credential) {
      try {
        const base64Url = credentialResponse.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const userInfo = JSON.parse(jsonPayload);
        setUser({
          name: userInfo.name,
          email: userInfo.email,
          picture: userInfo.picture,
        });
      } catch (error) {
        console.error('Error decoding JWT:', error);
      }
    }
  };

  const handleLoginError = () => {
    console.log('Login Failed');
  };

  const handleLogout = () => {
    googleLogout();
    setUser(null);
  };


  // Custom Google Sign-in Button Component matching site design
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        // Fetch user info using the access token
        const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenResponse.access_token}`);
        const userInfo = await response.json();
        
        setUser({
          name: userInfo.name,
          email: userInfo.email,
          picture: userInfo.picture,
        });
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    },
    onError: handleLoginError,
  });

  const CustomGoogleButton = ({ 
    size = "medium", 
    className = "" 
  }: { 
    size?: "small" | "medium" | "large", 
    className?: string
  }) => {
    const sizeClasses = {
      small: "px-4 py-2 text-sm",
      medium: "px-6 py-2.5 text-sm", 
      large: "px-8 py-3 text-base"
    };

    const widthClasses = {
      small: "w-48",
      medium: "w-60", 
      large: "w-72"
    };

    return (
      <button
        onClick={() => googleLogin()}
        className={`${sizeClasses[size]} ${widthClasses[size]} bg-gray-50 dark:bg-gray-900 border border-gray-600 dark:border-gray-500 rounded-md text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-600 hover:text-white dark:hover:bg-gray-500 dark:hover:text-white transition-all duration-200 flex items-center justify-center space-x-3 ${className}`}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        <span>Sign in with Google</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      {/* Simple Navigation */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-gray-600 rounded flex items-center justify-center">
                <span className="text-white font-medium text-xs">T</span>
              </div>
              <span className="text-lg font-medium text-gray-900 dark:text-white">Track My Jobs</span>
            </div>
            {user ? (
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
            ) : (<div />)}
          </div>
        </div>
      </nav>

      {/* Simple Hero Section */}
      <div className="max-w-4xl mx-auto px-6 py-20">
        <div className="text-center">
          <h1 className="text-4xl font-semibold text-gray-900 dark:text-white mb-4">
            Use AI to organize your job search.
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Without giving up your privacy.
          </p>
        </div>
      </div>

      {/* Get Started Button Section */}
      <div className="flex items-center justify-center min-h-[200px]">
        {user ? (
          <button className="bg-gray-800 hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 text-white px-6 py-3 rounded font-medium transition-colors">
            View Dashboard
          </button>
        ) : (
          <CustomGoogleButton size="large" />
        )}
      </div>

      {/* Simple Features */}
      <div className="max-w-5xl mx-auto px-6 py-16 flex flex-col justify-end min-h-[33vh]">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-10 h-10 bg-gray-600 dark:bg-gray-500 rounded flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">View Progress</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              See where you stand with each application at a glance.
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-gray-600 dark:bg-gray-500 rounded flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Private by Design</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              Your data never leaves your browser. Everything stays secure on your machine.
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-gray-600 dark:bg-gray-500 rounded flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Stay Organized</h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              Set reminders and never miss important deadlines.
            </p>
          </div>
        </div>
      </div>

      {/* Simple Footer - Fixed to bottom */}
      <footer className="fixed bottom-0 left-0 w-full bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-4 z-10">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            © 2025 Track My Jobs. Simple job application tracking.
          </p>
        </div>
      </footer>
    </div>
  );
}
