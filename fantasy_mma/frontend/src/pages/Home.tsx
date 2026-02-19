import React from 'react';
import { Link } from 'react-router-dom';
import { ChartBarIcon, UserGroupIcon, TrophyIcon, SparklesIcon } from '@heroicons/react/24/outline';

const features = [
  {
    name: 'AI-Powered Predictions',
    description: 'Get accurate fight predictions using our advanced machine learning models.',
    icon: SparklesIcon,
  },
  {
    name: 'Fantasy Leagues',
    description: 'Create or join fantasy leagues and compete with other MMA fans.',
    icon: UserGroupIcon,
  },
  {
    name: 'Performance Tracking',
    description: 'Track your team\'s performance and compare with other players.',
    icon: ChartBarIcon,
  },
  {
    name: 'Win Prizes',
    description: 'Compete for prizes and bragging rights in your fantasy league.',
    icon: TrophyIcon,
  },
];

const Home = () => {
  return (
    <div className="relative isolate">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Fantasy MMA Platform
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Experience the thrill of fantasy MMA with AI-powered predictions, real-time updates, and competitive leagues.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              to="/register"
              className="btn btn-primary"
            >
              Get Started
            </Link>
            <Link
              to="/fighters"
              className="btn btn-secondary"
            >
              View Fighters
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-4">
            {features.map((feature) => (
              <div key={feature.name} className="flex flex-col">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                  <feature.icon className="h-5 w-5 flex-none text-primary-600" aria-hidden="true" />
                  {feature.name}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">{feature.description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
};

export default Home; 