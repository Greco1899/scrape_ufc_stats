import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from '@heroicons/react/24/outline';

// TODO: Replace with actual API calls
const mockLeagues = [
  {
    id: 1,
    name: 'UFC Experts League',
    members: 12,
    status: 'active',
    nextEvent: 'UFC 313',
    eventDate: '2025-03-08',
  },
  {
    id: 2,
    name: 'MMA Masters',
    members: 8,
    status: 'active',
    nextEvent: 'UFC Fight Night',
    eventDate: '2025-03-15',
  },
  {
    id: 3,
    name: 'Fight Night Champions',
    members: 16,
    status: 'upcoming',
    nextEvent: 'UFC 314',
    eventDate: '2025-03-22',
  },
];

const Leagues = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    maxMembers: 12,
  });

  // TODO: Replace with actual API calls
  const { data: leagues, isLoading, error } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => Promise.resolve(mockLeagues),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement league creation API call
    console.log('Creating league:', formData);
    setIsCreating(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="text-sm text-red-700">Error loading leagues</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Fantasy Leagues</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="btn btn-primary flex items-center"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Create League
        </button>
      </div>

      {isCreating && (
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Create New League</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                League Name
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input mt-1"
                required
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="input mt-1"
                rows={3}
              />
            </div>
            <div>
              <label htmlFor="maxMembers" className="block text-sm font-medium text-gray-700">
                Maximum Members
              </label>
              <input
                type="number"
                id="maxMembers"
                value={formData.maxMembers}
                onChange={(e) => setFormData({ ...formData, maxMembers: parseInt(e.target.value) })}
                className="input mt-1"
                min="2"
                max="20"
                required
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Create League
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {leagues?.map((league) => (
          <div key={league.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-medium text-gray-900">{league.name}</h3>
                <p className="text-sm text-gray-500">{league.members} members</p>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                league.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {league.status}
              </span>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500">Next Event</p>
              <p className="text-sm font-medium text-gray-900">{league.nextEvent}</p>
              <p className="text-sm text-gray-500">{league.eventDate}</p>
            </div>
            <div className="mt-4">
              <button className="btn btn-primary w-full">
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Leagues; 