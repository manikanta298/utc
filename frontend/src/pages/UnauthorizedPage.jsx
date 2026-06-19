import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
          <ShieldAlert size={28} className="text-red-400" />
        </div>
        <h1 className="font-display text-2xl font-bold text-white">Access denied</h1>
        <p className="mt-2 text-sm text-gray-500">
          Your role does not have permission to open this page.
        </p>
        <Link to="/" className="btn-primary inline-flex mt-6">
          Go to workspace
        </Link>
      </div>
    </div>
  );
}
