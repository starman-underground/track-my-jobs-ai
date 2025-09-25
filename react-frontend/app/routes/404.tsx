import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  // Return 404 status for unknown routes
  return new Response(null, { status: 404 });
}

export default function NotFound() {
  return (
    <div className="not-found-container" style={{ 
      textAlign: 'center', 
      padding: '2rem',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>404</h1>
      <h2 style={{ marginBottom: '1rem' }}>Page Not Found</h2>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        The page you're looking for doesn't exist or may have been moved.
      </p>
      <a 
        href="/" 
        style={{
          backgroundColor: '#007bff',
          color: 'white',
          padding: '0.5rem 1rem',
          textDecoration: 'none',
          borderRadius: '4px'
        }}
      >
        Go Back Home
      </a>
    </div>
  );
}
