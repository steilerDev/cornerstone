import { useEffect, useState } from 'react';

interface HealthResponse {
  status: string;
  timestamp: string;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold text-gray-900">Cornerstone</h1>
        <p className="mb-6 text-lg text-gray-600">Home Building Project Management</p>
        {health && (
          <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
            Server: {health.status} | {health.timestamp}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
            Server connection failed: {error}
          </div>
        )}
      </div>
    </div>
  );
}
